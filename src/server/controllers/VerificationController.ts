import { NextFunction, Request, Response, Router } from 'express';
import BaseController from './BaseController';
import { IController } from '../../common/interfaces';
import { IVerificationService } from '@ethereum-sourcify/verification';
import { InputData, getChainId, Logger, PathContent, Match, PathBuffer, BufferMap, CheckedContract } from '@ethereum-sourcify/core';
import { NotFoundError } from '../../common/errors'
import { IValidationService } from '@ethereum-sourcify/validation';
import * as bunyan from 'bunyan';
import config from '../../config';
import fileUpload from 'express-fileupload';
import { Session } from 'express-session';

type ContractWrapper = {
    data: CheckedContract,
    chain: string,
    address: string,
};

interface ContractMap {
    [id: string]: ContractWrapper;
}

type MySession = Session & {
    inputFiles: BufferMap;
    unusedSources: PathContent[];
    pendingContracts: ContractMap;
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

    verifyEndpoint = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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
            
            const mySession = req.session as MySession;
            this.addInputFiles(req);
            const unused: PathContent[] = [];
            const validatedContracts = this.validationService.checkFiles(mySession.inputFiles, unused);
            const errors = validatedContracts
                            .filter(contract => Object.keys(contract.invalid).length)
                            .map(contract => `${contract.name} ${Object(contract.invalid).keys()}`);

            if (errors.length) {
                return next(new NotFoundError("Errors in:\n" + errors.join("\n"), false));
            }

            const inputData: InputData = {
                contracts: validatedContracts,
                addresses: [req.body.address], // TODO temporarily only one address supported
                chain
            };
            const matches: Promise<Match>[] = []; // TODO verificationService should return an array of matches
            matches.push(this.verificationService.inject(inputData, config.localchain.url));
            const result = await Promise.all(matches).catch(); // TODO this probably shouldn't be empty, but has been since at least September 2020
            res.status(200).send({ result });
        }

    }

    verifyEndpoint2 = async () => {
        // TODO this should be triggered by a user pressing the verify button on the frontend
        // TODO cover the following cases: only one verification required
    }

    validate = async (req: Request) => {
        const session = (req.session as MySession);
        const inputFiles = session.inputFiles;
        const unusedFiles: PathContent[] = [];
        this.validationService.checkFiles(inputFiles, unusedFiles);
        // TODO session.unusedFiles = unusedFiles;
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

    getInputFilesEndpoint = async (req: Request, res: Response) => {
        const inputFiles = (req.session as MySession).inputFiles || {};
        res.send(inputFiles);
    }

    addInputFilesEndpoint = async (req: Request, res: Response) => {
        const inputFiles = (req.session as MySession).inputFiles || {};
        
    }

    addInputFiles = async (req: Request) => {
        const pathBuffers = this.extractPathBuffers(req);
        // TODO add
    }

    deleteInputFilesEndpoint = async (req: Request, res: Response) => {
        const receivedFileNames = req.body.fileNames;
        const inputFiles = (req.session as MySession).inputFiles || {};
        
        for (const fileName of receivedFileNames) {
            delete inputFiles[fileName];
        }
    }

    getPendingContractsEndpoint = async (req: Request, res: Response) => {
        const pendingContracts = (req.session as MySession).pendingContracts || {};
        res.send(pendingContracts || {});
    }

    deletePendingContractsEndpoint = async (req: Request, res: Response) => {
        const contractIDs = req.body.contractIDs;
        if (!contractIDs) {
            return res.status(400).send("No contractIDs provided");
        }
        const pendingContracts = (req.session as MySession).pendingContracts;
        for (const id of contractIDs) {
            delete pendingContracts[id];
        }
    }

    resetSessionEndpoint = async (req: Request, res: Response) => {
        // TODO or simply delete req.session.nameOfProperty
        req.session.destroy((err: any) => {
            let logMethod: "error" | "info" = null;
            let msg = "";
            let statusCode = null;

            const loggerOptions: any = { loc: "[VERIFICATION_CONTROLER]", id: req.sessionID };
            if (err) {
                logMethod = "error";
                msg = "Error in session destruction";
                loggerOptions.err = err;
                statusCode = 500;

            } else {
                logMethod = "info";
                msg = "Session successfully destroyed";
                statusCode = 200;
            }

            this.logger[logMethod](loggerOptions, msg);
            res.status(statusCode).send(msg);
        });
    }

    getUnusedSourcesEndpoint = async () => {
        // TODO
    }

    getContractsEndpoint = async () => {
        // TODO
    }

    deleteContractsEndpoint = async () => {
        // TODO
    }

    registerRoutes = (): Router => {
        this.router
            .post([
            ], this.safeHandler(this.verifyEndpoint));
        
        this.router.route('/checkByAddresses')
            .get([], this.safeHandler(this.checkByAddresses));
        
        this.router.route('/files')
            .get(this.safeHandler(this.getInputFilesEndpoint))
            .post(this.safeHandler(this.addInputFilesEndpoint))
            .delete(this.safeHandler(this.deleteInputFilesEndpoint));
        
        this.router.route('/unused')
            .get(this.safeHandler(this.getUnusedSourcesEndpoint));
        
        this.router.route('/contracts')
            .get(this.safeHandler(this.getContractsEndpoint))
            .delete(this.safeHandler(this.deleteContractsEndpoint));
        
        this.router.route('/reset-verification-session')
            .post(this.safeHandler(this.resetSessionEndpoint));

        return this.router;
    }
}