import { app } from './app';
import { config } from './config';

console.log(`API listening on :${config.PORT}`);

export default {
  port: config.PORT,
  fetch: app.fetch,
};
