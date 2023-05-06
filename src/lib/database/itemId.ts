/**
 * V1 of the item IDs
 * @param {number | null} killeaterscoretype 
 * @param {number} defIndex 
 * @param {number} paintIndex 
 * @param {number} paintSeed 
 * @param {number} rarity 
 * @param {number} quality 
 * @param {number} paintWear 
 * @returns {string} 32-character ID
 */

import { ItemData, StickerInItem } from "../types/BotTypes";

export function createItemID_V1(killeaterscoretype: number | null, defIndex: number, paintIndex: number, paintSeed: number, rarity: number, quality: number, paintWear: number): string {
    let id = '0';

    id += formatKillEaterType(killeaterscoretype);
    id += formatInt(defIndex, 3);
    id += formatInt(paintIndex, 3);
    id += formatInt(paintSeed, 3);
    id += formatInt(rarity, 2);
    id += formatInt(quality, 2);
    id += formatPaintWear(paintWear);

    return id;
}

export function getItemIDFromItem(item: ItemData) {
    return createItemID_V1(item.killeaterscoretype, item.defindex, item.paintindex, item.paintseed ?? 0, item.rarity, item.quality, item.paintwear)
}

export function validateItemId(id: string): boolean {
    if (id.length !== 32) {
        return false;
    }
    if (id.match(/[^0-9]/)) {
        return false;
    }

    return true;
}

function formatKillEaterType(type: number | null): number {
    if (type === null) {
        return 0;
    }

    return type + 1;
}

function formatPaintWear(float: number): string {
    if (float >= 1) {
        return '00000000000000000'
    }
    if (float <= 0) {
        return '00000000000000000'
    }

    let fling = float.toFixed(17);

    fling = fling.slice(2, fling.length);

    fling = formatFloatDecimals(fling, 17);

    return fling;
}

function formatRotation(float: number): string {
    if (float === 0) {
        return '1' + '0' + '0'.repeat(17);
    }

    let str = '';

    if (float < 0) {
        str += '0';
    }

    if (float > 0) {
        str += '2';
    }

    str += Math.floor(Math.abs(float));

    let fling = Math.abs(float).toString();

    fling = fling.slice(2, fling.length);

    str += formatFloatDecimals(fling, 17);

    return str;
}

function formatScale(float: number): string {
    if (float === 0) {
        return '000000000000000000';
    }

    let str = Math.floor(float).toString();

    let fling = float.toString();

    fling = fling.slice(2, fling.length);

    str += formatFloatDecimals(fling, 17);

    return str;
}

function formatInt(int: number, digits: number): string {
    // Make sure its an int and not a float
    const strint = Math.round(int).toString();

    if (strint.length < digits) {
        return '0'.repeat(digits-strint.length) + strint;
    }
    if (strint.length > digits) {
        return strint.slice(0, digits-1);
    }

    return strint;
}

function formatFloatDecimals(floatDec: string, digits: number): string {
    if (floatDec.length < digits) {
        return floatDec + '0'.repeat(digits-floatDec.length);
    }
    if (floatDec.length > digits) {
        return floatDec.slice(0, digits-1);
    }

    return floatDec;
}

export function serializeStickerData_V1(stickerId: number, slot: number, wear: number | null, scale: number | null, rotation: number | null, tint_id: number | null): string {
    let id = '0';

    if (wear === null) {
        wear = 0;
    }

    if (scale === null) {
        scale = 0;
    }

    if (rotation === null) {
        rotation = 0;
    }

    if (tint_id === null) {
        tint_id = 0;
    } else {
        tint_id++;
    }

    // 5
    id += formatInt(stickerId, 5);
    // 2
    id += formatInt(slot, 2);
    // 17
    id += formatPaintWear(wear);
    // 18
    id += formatScale(scale);
    // 19
    id += formatRotation(rotation);
    // 2
    id += formatInt(tint_id, 2);

    // 64
    return id;
}

export function deserializeStickerData_V1(data: string) {
    if (!data.startsWith('0') || data.length !== 64 ) {
        return null;
    }

    let matched = data.match(/^0(\d{5,5})(\d\d)(\d{17})(\d{18})(\d{19})(\d\d)$/)

    if (!matched) {
        return null;
    }

    const sticker: StickerInItem = {
        sticker_id: 0,
        slot: 0,
        wear: null,
        scale: null,
        rotation: null,
        tint_id: null
    }

    sticker.sticker_id = parseInt(matched[1]);

    sticker.slot = parseInt(matched[2]);

    sticker.wear = parseFloat('0.' + matched[3]);
    if (sticker.wear === 0) {
        sticker.wear = null;
    }

    sticker.scale = parseFloat(`${matched[4].at(0)}.${matched[4].slice(1, matched[4].length)}`);
    if (sticker.scale === 0) {
        sticker.scale = null;
    }

    let rotation = '';
    if (matched[5].at(0) === '1') {
        sticker.rotation = null;
    } else {
        if (matched[5].at(0) === '0') {
            rotation += '-';
        }

        rotation += `${matched[5].at(1)}.${matched[5].slice(2, matched[5].length)}`;

        sticker.rotation = parseFloat(rotation);
    }

    sticker.tint_id = parseInt(matched[6]);
    if (sticker.tint_id === 0) {
        sticker.tint_id = null;
    }

    return sticker;
}