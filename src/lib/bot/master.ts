import { EventEmitter } from 'events';

import Bot from './bot.js';
import { inspectRequestToInspectFields, linkToInspectRequest } from '../util.js';

import { BotSettings, InspectRequest, ItemData, LoginConfig } from '../types/BotTypes';
import DataManager from '../database/index.js';
import InspectCache from './cache.js';

export default class Master extends EventEmitter {
  #inspectQueue: (InspectRequest | null)[] = [];
  #botsBusyIndex: boolean[] = [];
  #database: DataManager | null;
  #botsAvailable: number = 0;
  #botsNotBusy: number = 0;
  #settings: BotSettings;
  #logins: LoginConfig[];
  #bots: Bot[] = [];
  #inspectCache: InspectCache | null = null;

  constructor(logins: LoginConfig[], settings: BotSettings, database: DataManager | null = null) {
    super();

    this.#logins = logins;
    this.#settings = settings;

    this.#database = database;

    if (database !== null) {
      this.#inspectCache = new InspectCache(database);
    }

    this.#createBots();
  }

  #createBots() {
    for (let i = 0; i < this.#logins.length; i++) {
      let login = this.#logins[i];
      let delay = 0;

      if (i !== 0) {
        delay = Math.round(Math.random() * 4 * 60 * 1000);
      }

      const bot = new Bot(this.#settings);

      setTimeout(() => {
        bot.login(login.user, login.pass, login.auth);
      }, delay)

      this.#bots.push(bot);

      if (this.#bots.length === this.#logins.length) {
        this.#bindEvents();
      }
    }
  }

  #bindEvents() {
    for (let i = 0; i < this.#bots.length; i++) {
      const bot = this.#bots[i];
      const _this = this;

      function handleBusy() {
        _this.#botsBusyIndex[i] = _this.#bots[i].busy;
        _this.botsNotBusy = _this.#botsBusyIndex.filter(x => x === false).length;
      }

      bot.on('ready', () => {
        this.#botsAvailable++;
        handleBusy()
      })
      bot.on('unready', () => {
        this.#botsAvailable--;
        handleBusy()
      })
      bot.on('busy', handleBusy)
      bot.on('unbusy', handleBusy)
    }
  }

  #getNonBusyBot() {
    for (let i = 0; i < this.#bots.length; i++) {
      if (this.#botsBusyIndex[i] === false) {
        return i;
      }
    }
  }

  async #handleNextInspect() {
    if (!this.#inspectQueue.length || !this.#botsNotBusy) {
      return;
    }

    let inspectData = this.#inspectQueue.shift();

    if (!inspectData) {
      return;
    }

    let botIndex = this.#getNonBusyBot()
    if (typeof botIndex === 'number') {
      this.#bots[botIndex].sendFloatRequest(inspectData)
        .then((res) => {
          this.emit('inspectResult', res);
        })
        .catch((err) => {
          this.emit('inspectResult', `${inspectData?.a} ${err as string}`);
        })
    }
  }

  inspectItem(link: string, addAdditional: boolean = false): Promise<ItemData> {
    return new Promise(async (resolve, reject) => {
      if (!this.#botsAvailable) {
        reject('No bots available');
      }

      const params = linkToInspectRequest(link);

      if (params === null) {
        reject('Invalid link');
        return;
      }

      if (this.#inspectCache) {
        let inspectFields = inspectRequestToInspectFields(params);
        let cachedItem: ItemData | null = await this.#inspectCache.getItemByInspectFields(inspectFields);

        if (cachedItem !== null) {
          if (addAdditional) {
            cachedItem = this.#database?.gameData.addAdditionalItemProperties(cachedItem) || cachedItem;
          }
          return resolve(cachedItem);
        }
      }

      this.#inspectQueue.push(params);

      let _this = this;

      this.on('inspectResult', function cb(res: ItemData | string) {
        if (typeof res === 'string') {
          if (res.startsWith(params.a)) {
            return reject(res);
          }
        } else if (res.a = params.a) {
          _this.removeListener('inspectResult', cb);

          if (addAdditional) {
            res = _this.#database?.gameData.addAdditionalItemProperties(res) || res;
          }

          // The saving process not being awaited is intentional, as it is not neccessary to accomplish the request and can be side-lined.
          if (_this.#inspectCache) {
            if (res.s !== '0') {
              _this.#inspectCache.createOrUpdateItem(res, res.s, false);
            } else {
              _this.#inspectCache.createOrUpdateItem(res, res.m, true);
            }
          }

          resolve(res);
        }
      })

      if (this.#botsNotBusy > 0) {
        this.#handleNextInspect();
      }
    })
  }

  #inspectItemBulk(params: InspectRequest, addAdditional: boolean = false): Promise<ItemData> {
    return new Promise(async (resolve, reject) => {
      if (!this.#botsAvailable) {
        reject('No bots available');
      }

      if (this.#inspectCache) {
        let inspectFields = inspectRequestToInspectFields(params);
        let cachedItem: ItemData | null = await this.#inspectCache.getItemByInspectFields(inspectFields);

        if (cachedItem !== null) {
          if (addAdditional) {
            cachedItem = this.#database?.gameData.addAdditionalItemProperties(cachedItem) || cachedItem;
          }
          
          return resolve(cachedItem);
        }
      }

      this.#inspectQueue.push(params);

      let _this = this;

      this.on('inspectResult', function cb(res: ItemData | string) {
        if (typeof res === 'string') {
          if (res.startsWith(params.a)) {
            return reject(res);
          }
        } else if (res.a = params.a) {
          _this.removeListener('inspectResult', cb)

          if (addAdditional) {
            res = _this.#database?.gameData.addAdditionalItemProperties(res) || res;
          }

          // The saving process not being awaited is intentional, as it is not neccessary to accomplish the request and can be side-lined.
          if (_this.#inspectCache) {
            if (res.s !== '0') {
              _this.#inspectCache.createOrUpdateItem(res, res.s, false);
            } else {
              _this.#inspectCache.createOrUpdateItem(res, res.m, true);
            }
          }

          resolve(res);
        }
      })

      if (this.botsNotBusy !== 0) {
        this.#handleNextInspect();
      }
    })
  }

  inspectItemBulk(links: string[], addAdditional: boolean = false): Promise<ItemData[]> {
    return new Promise(async (resolve, reject) => {
      const items: ItemData[] = [];

      for (let link of links) {
        const params = linkToInspectRequest(link);

        if (params === null) {
          reject('Invalid link');
          return;
        }

        let itemData = await this.#inspectItemBulk(params, addAdditional);

        items.push(itemData);
      }

      resolve(items);
    })
  }

  set botsNotBusy(val: number) {
    this.#botsNotBusy = val;

    if (this.#botsNotBusy > 0) {
      this.#handleNextInspect();
    }
  }

  get botsNotBusy() {
    return this.#botsNotBusy;
  }

  get botsAvailable() {
    return this.#botsAvailable;
  }
}