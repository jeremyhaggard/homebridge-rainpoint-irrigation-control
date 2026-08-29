"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hexToBytes = hexToBytes;
exports.parseDpStatus = parseDpStatus;
exports.bytesToHex = bytesToHex;
exports.hexToSignedInt = hexToSignedInt;
exports.hexToUnsignedInt = hexToUnsignedInt;
exports.findDpByCode = findDpByCode;
exports.getDpIntValue = getDpIntValue;
exports.parseWorkMode = parseWorkMode;
exports.isValveOpen = isValveOpen;
function hexToBytes(hex) {
    const bytes = [];
    for (let i = 0; i < hex.length; i += 2) {
        bytes.push(parseInt(hex.substring(i, i + 2), 16));
    }
    return bytes;
}
function parseDpStatus(stateHex, hasDpIdPrefix = true) {
    const bytes = hexToBytes(stateHex);
    const results = [];
    let offset = 0;
    while (offset < bytes.length) {
        let dpId = 0;
        if (hasDpIdPrefix) {
            dpId = bytes[offset];
            offset++;
        }
        if (offset >= bytes.length)
            break;
        const typeByte = bytes[offset];
        offset++;
        let typeCode;
        let typeLen;
        let typeValue;
        if ((typeByte & 0x80) === 0) {
            typeCode = (typeByte >> 4) & 0x07;
            typeLen = 1;
            typeValue = [typeByte];
        }
        else {
            const typeBits = (typeByte >> 2) & 0x1F;
            const lengthBits = typeByte & 0x03;
            typeLen = lengthBits + 1;
            if (typeBits <= 30) {
                typeCode = typeBits + 8;
                const dataLen = lengthBits + 2;
                typeValue = Array.from(bytes.slice(offset, offset + dataLen));
                offset += dataLen;
            }
            else {
                if (offset >= bytes.length)
                    break;
                const nextByte = bytes[offset] & 0xFF;
                offset++;
                typeCode = nextByte + 0x27;
                const dataLen = lengthBits + 2;
                typeValue = Array.from(bytes.slice(offset, offset + dataLen));
                offset += dataLen;
            }
        }
        results.push({ dpId, typeCode, typeLen, typeValue });
    }
    return results;
}
function bytesToHex(bytes) {
    return bytes.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join('');
}
function hexToSignedInt(hex, bits = 8) {
    let value = parseInt(hex, 16);
    if (value >= Math.pow(2, bits - 1)) {
        value -= Math.pow(2, bits);
    }
    return value;
}
function hexToUnsignedInt(hex) {
    return parseInt(hex, 16);
}
function findDpByCode(parsed, dpCode) {
    return parsed.find(dp => dp.dpId === dpCode);
}
function getDpIntValue(dp) {
    if (dp.typeValue.length === 0)
        return 0;
    if (dp.typeValue.length === 1)
        return dp.typeValue[0];
    return dp.typeValue.reduce((acc, val, idx) => {
        return acc | (val << (8 * idx));
    }, 0);
}
function parseWorkMode(dpValue) {
    return {
        workMode: dpValue & 0x0F,
        controlMode: (dpValue >> 4) & 0x0F,
    };
}
function isValveOpen(dpValue) {
    return 5 * (31 & dpValue);
}
//# sourceMappingURL=dp-parser.js.map