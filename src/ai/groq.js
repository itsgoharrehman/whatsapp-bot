import { aiProvider } from './provider.js';

export const groq = {
  get keys() {
    return aiProvider.groqKeys;
  },
  getStatus() {
    return aiProvider.getStatus();
  }
};

export { aiProvider };
