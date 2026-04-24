import '@testing-library/jest-dom';
import { randomUUID } from 'crypto';

if (!global.structuredClone) {
  global.structuredClone = (value) => JSON.parse(JSON.stringify(value));
}

if (!global.crypto) {
  global.crypto = {};
}

if (!global.crypto.randomUUID) {
  global.crypto.randomUUID = randomUUID;
}
