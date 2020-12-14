import { NextFunction, Request, Response, Router } from 'express';
import BaseController from './BaseController';
import { IController } from '../../common/interfaces';
import { IVerificationService } from '@ethereum-sourcify/verification';
import { InputData, getChainId, Logger, PathContent, Match, PathBuffer, BufferMap } from '@ethereum-sourcify/core';
import { NotFoundError } from '../../common/errors'
import { IValidationService } from '@ethereum-sourcify/validation';
import * as bunyan from 'bunyan';
import config from '../../config';
import fileUpload from 'express-fileupload';
import { Session } from 'express-session';

type MySession = Session & {
    files: BufferMap;
};

type MySessionRequest = Request & {
    session: MySession;
};

export default class VerificationController extends BaseController implements IController {
    router: Router;
    verificationService: IVerificationService;
    validationService: IValidationService;
    logger: bunyan;

    constructor(verificationService: IVerificationService, validationService: IValidationService) {
        super();
        this.router = Router();
        this.verificationService = verificationService;
        this.validationService = validationService;
        this.logger = Logger("VerificationService");
    }

    verify = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        let chain;
        try {
            chain = getChainId(req.body.chain);
        } catch (error) {
            return next(error);
        }

        const result = await this.verificationService.findByAddress(req.body.address, chain, config.repository.path);
        if (result.length != 0) {
            res.status(200).send({ result });
        } else {
            if (!req.files) return next(new NotFoundError("Address for specified chain not found in repository"));
            
            const pathBuffers = this.extractPathBuffers(req);
            const mySession = req.session as MySession;
            this.setSessionFiles(pathBuffers, mySession);
            const unused: PathContent[] = [];
            const validatedContracts = this.validationService.checkFiles(mySession.files, unused);
            const errors = validatedContracts
                            .filter(contract => Object.keys(contract.invalid).length)
                            .map(contract => `${contract.name} ${Object(contract.invalid).keys()}`);

            if (errors.length) {
                return next(new NotFoundError("Errors in:\n" + errors.join("\n"), false));
            }

            const inputData: InputData = {
                contracts: validatedContracts,
                addresses: req.body.address,
                chain
            };
            const matches: Promise<Match>[] = []; // TODO verificationService should return an array of matches
            matches.push(this.verificationService.inject(inputData, config.localchain.url));
            Promise.all(matches).then((result) => {
                this.resetSession(req, res);
                res.status(200).send({ result });
            }).catch()
        }

    }

    checkByAddresses = async (req: any, res: Response) => {
        let resultArray: Array<Object> = [];
        const map: Map<string, Object> = new Map();
        for (const address of req.query.addresses.split(',')) {
            for (const chainId of req.query.chainIds.split(',')) {
                try {
                    const object: any = await this.verificationService.findByAddress(address, chainId, config.repository.path);
                    object.chainId = chainId;
                    if (object.length != 0) {
                        map.set(address, object[0]);
                        break;
                    }
                } catch (error) {
                    // ignore
                }
            }
            if (!map.has(address)) {
                map.set(address, {
                    "address": address,
                    "status": "false"
                })
            }
        }
        resultArray = Array.from(map.values())
        res.send(resultArray)
    }

    private extractPathBuffers(req: Request): PathBuffer[] {
        const filesArr: fileUpload.UploadedFile[] = [].concat(req.files.files); // ensure an array, regardless of how many files received
        const pathBuffers: PathBuffer[] = filesArr.map(f => ({ path: f.name, buffer: f.data }));
        return pathBuffers;
    }

    private setSessionFiles = (files: PathBuffer[], session: MySession, deleteUnmentioned = false) => {
        if (!session.files) {
            session.files = [];
        }

        if (deleteUnmentioned) {
            // delete files not mentioned in paths
            const incomingPaths = files.map(f => f.path);
            const toDelete: string[] = [];
            for (const path in session.files) {
                if (!incomingPaths.includes(path)) {
                    toDelete.push(path);
                }
            }

            toDelete.forEach(path => delete session.files[path]);
        }

        // add new files and replace old files with new content
        for (const file of files) {
            if (file.buffer.length) {
                session.files.push(file);
            }
        }
    };

    setSessionFilesEndpoint = async (req: Request, res: Response) => {
        const files = this.extractPathBuffers(req);
        this.setSessionFiles(files, req.session as MySession, true);
    };

    getSessionFilesEndpoint = async (req: Request, res: Response) => {
        // tried changing to req: MySessionRequest in the argument list
        // did not work because below it has to be passed to safeHandler
        const session = (req as MySessionRequest).session;
        res.send(session.files || {});
    }

    resetSession = async (req: Request, res: Response) => {
        const id = req.sessionID;
        // TODO or simply delete req.session.nameOfProperty
        req.session.destroy((err: any) => {
            let msg = "";
            let statusCode = null;

            const loggerOptions: any = { loc: "[VERIFICATION_CONTROLER]", id};
            if (err) {
                msg = "Error in session destruction";
                statusCode = 500;
                loggerOptions.err = err;
                this.logger.error(loggerOptions, msg);

            } else {
                msg = "Session successfully destroyed";
                statusCode = 200;
                this.logger.info(loggerOptions, msg);
            }

            res.status(statusCode).send(msg);
        });
    }

    registerRoutes = (): Router => {
        this.router
            .post([
            ], this.safeHandler(this.verify));
        
        this.router.route('/checkByAddresses')
            .get([], this.safeHandler(this.checkByAddresses));
        
        this.router.route('/session-files')
            .get(this.safeHandler(this.getSessionFilesEndpoint))
            .post(this.safeHandler(this.setSessionFilesEndpoint))
        
        this.router.route('/reset-verification-session')
            .post(this.safeHandler(this.resetSession));

        return this.router;
    }
}