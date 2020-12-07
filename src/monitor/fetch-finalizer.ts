import { PathBuffer, StringMap, CheckedContract } from "@ethereum-sourcify/core";
import { ValidationService } from "@ethereum-sourcify/validation";
import { Injector } from "@ethereum-sourcify/verification";
import Logger from "bunyan";

export default class FetchFinalizer {
    private chainId: string;
    private address: string;
    private bytecode: string;
    private validationService: ValidationService;
    private injector: Injector;
    private logger: Logger

    constructor(chainId: string, address: string, bytecode: string, injector: Injector) {
        this.chainId = chainId;
        this.address = address;
        this.bytecode = bytecode;
        this.injector = injector;
        this.logger = new Logger({ name: "FetchFinalizer", chainId, address }); // TODO are chainId and address legal?
    }

    finalize = (fetchedSources: StringMap) => {
        const pathBuffers: PathBuffer[] = [];
        for (const sourceName in fetchedSources) {
            const sourceValue = fetchedSources[sourceName];
            pathBuffers.push({ path: sourceName, buffer: Buffer.from(sourceValue) });
        }
        
        const contracts = this.validationService.checkFiles(pathBuffers);
        this.checkContractArray(contracts);
        
        this.injector.inject({
            addresses: [this.address],
            chain: this.chainId,
            bytecode: this.bytecode,
            contracts
        });
    }

    private checkContractArray(contracts: CheckedContract[]) {
        if (contracts.length !== 1) {
            const msg = `Cannot inject more than one contract per chain address; ${contracts.length} attempted.`;
            this.logger.error({
                loc: "[PENDING_CONTRACT]",
                chain: this.chainId,
                address: this.address
            }, msg);
            throw new Error(msg);
        }

        const contract = contracts[0];
        if (!contract.isValid()) {
            const msg = `Invalid contract ${contract.name} at chain ${this.chainId} at address ${this.address}.`;
            this.logger.error({
                loc: "[PENDING_CONTRACT]",
                name: contract.name,
                chain: this.chainId,
                address: this.address,
                missing: Object.keys(contract.missing)
            }, msg);
            throw new Error(msg);
        }
    }
}