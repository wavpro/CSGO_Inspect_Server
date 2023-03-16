import SteamUser from 'steam-user'
import GlobalOffensive from 'globaloffensive'
import SteamTotp from 'steam-totp'
import { EventEmitter } from 'events'

import { log, linkToInspectRequest, isInspectLinkValid } from "../util.js"

import login_errors from "../enum/BOT_LOGIN_ERRORS.js"

import type { LoginData, ItemData, InspectRequest, BotSettings } from "../types/BotTypes.js"

export default class Bot extends EventEmitter {
  #loggedIn = false;
  #relogin = false;
  #steamClient: SteamUser = new SteamUser({
    enablePicsCache: true
  });
  #csgoClient: GlobalOffensive = new GlobalOffensive(this.#steamClient);
  #loginData: LoginData = {
    accountName: '',
    password: '',
    rememberPassword: false,
    authCode: '',
    twoFactorCode: ''
  };
  #resolve: ((value: ItemData) => void) | boolean = false;
  #currentRequest: InspectRequest | boolean = false;
  ttlTimeout: NodeJS.Timeout | boolean = false;
  settings: BotSettings;
  busy: boolean = false;

  constructor(settings: BotSettings) {
    super();

    this.settings = settings;

    this.#bindEvents();

    // Variance to apply so that each bot relogins at different times
    const variance = Math.round(Math.random() * 4 * 60 * 1000);

    // As of 7/10/2020, GC inspect calls can timeout repeatedly for whatever reason
    setInterval(() => {
      if (this.#csgoClient.haveGCSession) {
        this.#relogin = true;
        this.#steamClient.relog();
      }
    }, 30 * 60 * 1000 + variance);
  }

  login(username: string, password: string, auth: string) {
    this.#loggedIn = false;

    if (this.#steamClient) this.#steamClient.logOff();

    this.#loginData = {
      accountName: username,
      password: password,
      rememberPassword: true,
    };

    if (auth && auth !== '') {
      // Check if it is a shared_secret
      if (auth.length <= 5) {
        this.#loginData.authCode = auth;
      } else {
        // Generate the code from the shared_secret
        log(this.#loginData.accountName, "Generating 2FA code from shared_secret.")
        this.#loginData.twoFactorCode = SteamTotp.getAuthCode(auth);
      }
    }

    log(this.#loginData.accountName, "Logging in...")
    this.#steamClient?.logOn(this.#loginData)
  }

  #bindEvents() {
    this.#steamClient.on('error', (err) => {
      log(this.#loginData.accountName, "Error logging in")

      if (err.eresult && login_errors[err.eresult] !== undefined) {
        log(this.#loginData.accountName, login_errors[err.eresult])
      }
    });

    this.#steamClient.on('disconnected', (eresult, msg) => {
      log(this.#loginData.accountName, `Logged off, reconnecting! (${eresult}, ${msg})`)
    });

    this.#steamClient.on('loggedOn', (details, parental) => {
      log(this.#loginData.accountName, `Log on OK`)

      // Fixes reconnecting to CS:GO GC since node-steam-user still assumes we're playing 730
      // and never sends the appLaunched event to node-globaloffensive
      this.#steamClient?.gamesPlayed([], true);

      if (this.#relogin) {
        // Don't check ownership cache since the event isn't always emitted on relogin
        log(this.#loginData.accountName, "Initiating GC Connection, Relogin")
        this.#steamClient.gamesPlayed([730], true);
        return;
      }

      // Ensure we own CSGO
      // We have to wait until app ownership is cached to safely check
      // @ts-ignore
      this.#steamClient.once('appOwnershipCached', () => {
        if (!this.#steamClient.ownsApp(730)) {
          log(this.#loginData.accountName, "Bot doesn't own CS:GO, retrieving free license")

          // Request a license for CS:GO
          this.#steamClient.requestFreeLicense([730], (err, grantedPackages, grantedAppIDs) => {
            log(this.#loginData.accountName, `Granted Packages ${grantedPackages.toString()}`);
            log(this.#loginData.accountName, `Granted App IDs ${grantedAppIDs.toString()}`);

            if (err) {
              log(this.#loginData.accountName, 'Failed to obtain free CS:GO license');
            } else {
              log(this.#loginData.accountName, 'Initiating GC Connection');
              this.#steamClient.gamesPlayed([730], true);
            }
          });
        } else {
          log(this.#loginData.accountName, 'Initiating GC Connection');
          this.#steamClient.gamesPlayed([730], true);
        }
      });
    });

    this.#csgoClient.on('inspectItemInfo', (itemData_) => {
      if (this.#resolve && typeof this.#currentRequest !== 'boolean') {
        const itemData: ItemData = {
          delay: 0,
          itemId: itemData_.itemid,
          defindex: itemData_.defindex,
          paintindex: itemData_.paintindex,
          rarity: itemData_.rarity,
          quality: itemData_.quality,
          killeatervalue: itemData_.killeatervalue || 0,
          paintseed: itemData_.paintseed || 0,
          s: '',
          a: '',
          d: '',
          m: '',
          paintwear: itemData_.paintwear,
          stickers: itemData_.stickers
        };

        // Ensure the received itemid is the same as what we want
        if (itemData.itemId !== this.#currentRequest.a) return;

        // Clear any TTL timeout
        if (typeof this.ttlTimeout !== 'boolean') {
          clearTimeout(this.ttlTimeout);
          this.ttlTimeout = false;
        }

        // GC requires a delay between subsequent requests
        // Figure out how long to delay until this bot isn't busy anymore
        let offset = new Date().getTime() - this.#currentRequest.time;
        let delay = this.settings.request_delay - offset;

        // If we're past the request delay, don't delay
        if (delay < 0) delay = 0;

        itemData.delay = delay;
        itemData.s = this.#currentRequest.s;
        itemData.a = this.#currentRequest.a;
        itemData.d = this.#currentRequest.d;
        itemData.m = this.#currentRequest.m;

        if (typeof this.#resolve !== 'boolean') {
          this.#resolve(itemData);
          this.#resolve = false;
          this.#currentRequest = false;

          setTimeout(() => {
            // We're no longer busy (satisfied request delay)
            this.busy = false;
          }, delay);
        }
      }
    });

    this.#csgoClient.on('connectedToGC', () => {
      log(this.#loginData.accountName, 'CSGO Client Ready!');

      this.#loggedIn = true;
    });

    this.#csgoClient.on('disconnectedFromGC', (reason) => {
      log(this.#loginData.accountName, `CSGO unready (${reason}), trying to reconnect!`);
      this.#loggedIn = false;

      // node-globaloffensive will automatically try to reconnect
    });

    this.#csgoClient.on('connectionStatus', (status) => {
      log(this.#loginData.accountName, `GC Connection Status Update ${status}`);

    });

    // @ts-ignore
    this.#csgoClient.on('debug', (msg) => {
      log(this.#loginData.accountName, `CSGO Debug ${msg}`);
    });
  }

  sendFloatRequest(link: string) {
    return new Promise((resolve, reject) => {
      if (!isInspectLinkValid) {
        log(this.#loginData.accountName, `Invalid link: ${link}`);
        reject("Invalid link.")
      }
      this.#resolve = resolve;
      this.busy = true;

      let params = linkToInspectRequest(link)

      // Guaranteed to work, but typescript wants reassurance lol
      if (params) {
        this.#currentRequest = params

        log(this.#loginData.accountName, `Fetching for ${this.#currentRequest.a}`);

        if (!this.loggedIn) {
          reject('This bot is not ready');
        } else {
          // The first param (owner) depends on the type of inspect link
          this.#csgoClient.inspectItem(params.s !== '0' ? params.s : params.m, params.a, params.d);
        }

        // Set a timeout in case the GC takes too long to respond
        this.ttlTimeout = setTimeout(() => {
          // GC didn't respond in time, reset and reject
          this.busy = false;
          this.#currentRequest = false;
          reject('ttl exceeded');
        }, this.settings.request_ttl);
      }
    });
  }

  set loggedIn(val) {
    const prev = this.loggedIn;
    this.#loggedIn = val;

    if (val !== prev) {
      this.emit(val ? 'ready' : 'unready');
    }
  }

  get loggedIn() {
    return this.#loggedIn || false;
  }
}