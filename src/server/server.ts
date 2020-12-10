import express from 'express';
import serveIndex from 'serve-index';
import fileUpload from 'express-fileupload';
import cors from 'cors';
import routes from './routes';
import bodyParser from 'body-parser';
import config from '../config';
import { Logger } from '@ethereum-sourcify/core';
import bunyan from 'bunyan';
import genericErrorHandler from './middlewares/GenericErrorHandler';
import notFoundHandler from './middlewares/NotFoundError';
import session from 'express-session';

export const logger: bunyan = Logger("Server");
export class Server {

  app: express.Application;
  repository = config.repository.path;
  port = config.server.port;
  localChainUrl?: string;

  constructor() {
    if (config.testing) {
      this.localChainUrl = config.localchain.url;
    }

    this.app = express();

    // TODO: 52MB is the max file size - is this right?
    this.app.use(fileUpload({
      limits: { fileSize: 50 * 1024 * 1024 },
      abortOnLimit: true
    }))
    
    this.app.use(cors())
    this.app.use(bodyParser.json());
    this.app.use(bodyParser.urlencoded({ extended: true }));
    this.app.use(session(getSessionOptions()));
    this.app.get('/health', (_req, res) => res.status(200).send('Alive and kicking!'))
    this.app.use('/repository', express.static(this.repository), serveIndex(this.repository, {'icons': true}))
    this.app.use('/', routes);
    this.app.use(genericErrorHandler);
    this.app.use(notFoundHandler);
    this.app.listen(this.port, () => logger.info({loc: '[LISTEN]'}, `Injector listening on port ${this.port}!`))
  }
}

function getSessionOptions(): session.SessionOptions {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("Environment variable SESSION_SECRET must be provided!");
  }

  const defaultMaxAge = 12 * 60 * 60 * 1000; // defaults to 12 hrs in millis
  const maxAge = parseInt(process.env.SESSION_MAX_AGE, 10) || defaultMaxAge;

  return {
    secret,
    rolling: true,
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge } };
}

if (require.main === module) {
  const server = new Server();
}
