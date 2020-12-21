import { NextFunction, Request, Response, Router } from 'express';
import BaseController from './BaseController';
import { IController } from '../../common/interfaces';
import { IVerificationService } from '@ethereum-sourcify/verification';
import { InputData, getChainId, Logger, PathBuffer, CheckedContract, isEmpty } from '@ethereum-sourcify/core';
import { BadRequestError, NotFoundError } from '../../common/errors'
import { IValidationService } from '@ethereum-sourcify/validation';
import * as bunyan from 'bunyan';
import config from '../../config';
import fileUpload from 'express-fileupload';
import { Session } from 'express-session';
import { isValidAddress } from '../../common/validators/validators';

type ContractLocation = {
    chain: string,
    address: string
}

type ContractWrapper =
    ContractLocation & {
    contract: CheckedContract,
};

interface ContractLocationMap {
    [id: string]: ContractLocation;
}

interface ContractMap {
    [id: string]: ContractWrapper;
}

interface PathBufferMap {
    [id: string]: PathBuffer;
}

type SessionMaps = {
    inputFiles: PathBufferMap;
    pendingContracts: ContractMap;
};

type MySession = 
    Session &
    SessionMaps & { 
    unusedSources: string[],
    started: boolean
};

export default class VerificationController extends BaseController implements IController {
    router: Router;
    verificationService: IVerificationService;
    validationService: IValidationService;
    logger: bunyan;

    private static readonly MAX_INPUT_SIZE = 10 * 1024 * 1024; // 10 MB

    constructor(verificationService: IVerificationService, validationService: IValidationService) {
        super();
        this.router = Router();
        this.verificationService = verificationService;
        this.validationService = validationService;
        this.logger = Logger("VerificationService");
    }

    private legacyVerifyEndpoint = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
        let chain;
        try {
            chain = getChainId(req.body.chain);
        } catch (error) {
            return next(error);
        }

        const address = req.body.address;
        if (!isValidAddress(address)) {
            return next("Invalid address provided: " + address);
        }

        const result = await this.verificationService.findByAddress(address, chain, config.repository.path);
        if (result.length != 0) {
            res.status(200).send({ result });
        } else {
            const session = req.session as MySession;
            let inputFiles: PathBuffer[] = null;
            try {
                const extracted = this.extractFiles(req);
                if (!extracted) {
                    const msg = "The contract at the provided address has not yet been sourcified.";
                    return next(new NotFoundError(msg));
                }
                
                inputFiles = session.started ? this.saveFiles(extracted, session) : extracted;
            } catch(err) {
                return next(err);
            }
            
            const validatedContracts = this.validationService.checkFiles(inputFiles);
            const errors = validatedContracts
                            .filter(contract => Object.keys(contract.invalid).length)
                            .map(contract => `${contract.name} ${Object(contract.invalid).keys()}`);

            if (errors.length) {
                return next(new BadRequestError("Errors in:\n" + errors.join("\n"), false));
            }

            const inputData: InputData = {
                contracts: validatedContracts,
                addresses: [address],
                chain
            };

            const resultPromise = this.verificationService.inject(inputData, config.localchain.url);
            resultPromise.then(result => {
                res.status(200).send({ result });
            }).catch(err => {
                res.status(500).send({ err }); // TODO the property name of the sent object
            });
        }

    }

    private checkByAddresses = async (req: any, res: Response) => {
        const missingParams = ["addresses", "chainIds"].filter(p => !req.query[p]);
        if (missingParams) {
            const msg = `Missing query parameters: ${missingParams.join(", ")}`;
            return res.status(400).send({ error: msg });
        }
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

    private validateEndpoint = async (req: Request, res: Response) => {
        const session = (req.session as MySession);
        if (!session.inputFiles || isEmpty(session.inputFiles)) {
            // TODO log
            throw new BadRequestError("No input files to use for validation.");
        }

        if (!session.pendingContracts) {
            session.pendingContracts = {};
        }

        const pathBuffers: PathBuffer[] = [];
        for (const id in session.inputFiles) {
            pathBuffers.push(session.inputFiles[id]);
        }
        
        const unused: string[] = [];
        this.validationService.checkFiles(pathBuffers, unused);
        this.updateUnused(unused, session);
    }

    private verifyValidatedEndpoint = async (req: any, res: Response) => {
        const session = (req.session as MySession);
        if (!session.pendingContracts || isEmpty(session.pendingContracts)) {
            // TODO log
            throw new BadRequestError("There are currently no pending contracts. Make them pending by validating.");
        }

        // don't care if values within are undefined, future version should be able to guess the address
        const locations: ContractLocationMap = req.body.locations || {};

        const validated: ContractWrapper[] = [];
        const invalidIds: string[] = [];
        for (const id in locations) {
            const contractWrapper = session.pendingContracts[id];
            if (id in session.pendingContracts && contractWrapper.contract.isValid()) {
                validated.push(contractWrapper);
            } else {
                invalidIds.push(id);
            }
        }

        if (invalidIds.length) {
            return res.status(200).send({
                msg: "Some pending contracts are invalid",
                invalid: invalidIds
            });
        }

        return this.verifyValidated(validated);
    }

    private verifyValidated(validatedContracts: ContractWrapper[]) {
        // TODO this requires changing the interface of the inject method
        return this.verificationService.inject(null, config.localchain.url).catch(); // TODO improve this catch
    }

    private extractFiles(req: Request): PathBuffer[] {
        let pathBuffers: PathBuffer[];
        if (req.files) {
            if (!req.files.files) {
                // TODO log
                throw new BadRequestError('The uploaded files should be under the "files" property');
            }
            const fileArr: fileUpload.UploadedFile[] = [].concat(req.files.files); // ensure an array, regardless of how many files received
            pathBuffers = fileArr.map(f => ({ path: f.name, buffer: f.data }));

        } else if (req.body.files) {
            pathBuffers = [];
            for (const name in req.body.files) {
                const buffer = Buffer.from(req.body.files[name]);
                pathBuffers.push({ path: name, buffer });
            }

        } else {
            return null;
        }

        return pathBuffers;
    }

    private saveFiles(pathBuffers: PathBuffer[], session: MySession): PathBuffer[] {
        if (!session.inputFiles) {
            session.inputFiles = {};
        }
        
        let inputSize = 0; // shall contain old buffer size + new files size
        const newPathBuffers: PathBuffer[] = [];
        for (const id in session.inputFiles) {
            const pb = session.inputFiles[id];
            newPathBuffers.push(pb);
            inputSize += pb.buffer.length;
        }

        pathBuffers.forEach(pb => inputSize += pb.buffer.length);

        if (inputSize > VerificationController.MAX_INPUT_SIZE) {
            const msg = "Too much session memory used. Delete some files or restart the session";
            throw new BadRequestError(msg); // TODO 413 Payload Too Large
        }

        pathBuffers.forEach(pb => {
            session.inputFiles[this.generateId()] = pb;
            newPathBuffers.push(pb);
        });

        return newPathBuffers;
    }

    private generateId(): string {
        return `${Date.now()}-${Math.random.toString().slice(2)}`;
    }

    private getInputFilesEndpoint = async (req: Request, res: Response) => {
        const inputFiles = (req.session as MySession).inputFiles || {};
        res.send(inputFiles);
    }

    private addInputFilesEndpoint = async (req: Request, res: Response) => {
        if (!req.body.files) {
            return res.status(400).send({ error: 'No "files" provided' });
        }

        const pathBuffers = this.extractFiles(req);
        const session = (req.session as MySession);
        this.saveFiles(pathBuffers, session);
    }

    private updateUnused(unused: string[], session: MySession) {
        if (!session.unusedSources) {
            session.unusedSources = [];
        }
        session.unusedSources = unused;
    }

    private deleteEndpoint = async (req: Request, res: Response, property: keyof SessionMaps) => {
        const ids: string[] = req.body.ids;
        if (!ids || !ids.length) {
            return res.status(400).send({ error: "No ids specified" });
        }
        
        const objects = (req.session as MySession)[property] || {};

        const notFound = [];
        for (const id of ids) {
            const deleted = delete objects[id];
            if (!deleted) {
                notFound.push(id);
            }
        }

        if (notFound.length) {
            return res.status(400).send({
                error: "Some ids could not be deleted",
                notFound,
                remaining: Object.keys(objects)
            });
        }

        res.status(200).send({ remaining: Object.keys(objects) });
    }

    private deleteInputFilesEndpoint = async (req: Request, res: Response) => {
        this.deleteEndpoint(req, res, "inputFiles");
    }

    private getPendingContractsEndpoint = async (req: Request, res: Response) => {
        const pendingContracts = (req.session as MySession).pendingContracts || {};
        res.send(pendingContracts || {});
    }

    private deletePendingContractsEndpoint = async (req: Request, res: Response) => {
        this.deleteEndpoint(req, res, "pendingContracts");
    }

    private startSessionEndpoint = async (req: Request, res: Response) => {
        const session = (req.session as MySession);
        const msg = session.started ? "Session already started" : "New session started";
        session.started = true;
        res.status(200).send(msg);
    }

    private resetSessionEndpoint = async (req: Request, res: Response) => {
        // TODO or simply delete req.session.nameOfProperty
        req.session.destroy((err: any) => {
            let logMethod: keyof bunyan = null;
            let msg = "";
            let statusCode = null;

            const loggerOptions: any = { loc: "[VERIFICATION_CONTROLER:RESET]", id: req.sessionID };
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

    private getUnusedSourcesEndpoint = async (req: Request, res: Response) => {
        const session = (req.session as MySession);
        res.send(session.unusedSources || []);
    }

    registerRoutes = (): Router => {
        this.router
            .post([], this.safeHandler(this.legacyVerifyEndpoint));
        
        this.router.route('/checkByAddresses') // TODO should change name to conventional (kebab instead of camel case)
            .get([], this.safeHandler(this.checkByAddresses));
        
        this.router.route('/files')
            .get(this.safeHandler(this.getInputFilesEndpoint))
            .post(this.safeHandler(this.addInputFilesEndpoint))
            .delete(this.safeHandler(this.deleteInputFilesEndpoint));
        
        this.router.route('/unused')
            .get(this.safeHandler(this.getUnusedSourcesEndpoint));
        
        this.router.route('/contracts')
            .get(this.safeHandler(this.getPendingContractsEndpoint))
            .delete(this.safeHandler(this.deletePendingContractsEndpoint));
        
        this.router.route('/reset-session')
            .post(this.safeHandler(this.resetSessionEndpoint));
        
        this.router.route('/start-session')
            .post(this.safeHandler(this.startSessionEndpoint));
        
        this.router.route('/validate')
            .post(this.safeHandler(this.validateEndpoint));

        this.router.route('/verify-validated')
            .post(this.safeHandler(this.verifyValidatedEndpoint));

        return this.router;
    }
}