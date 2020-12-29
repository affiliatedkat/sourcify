import { Session } from 'express-session';
import { Match, PathBuffer, CheckedContract, StringMap, isEmpty } from '@ethereum-sourcify/core';
import Web3 from 'web3';

export interface PathBufferMap {
    [id: string]: PathBuffer;
}

export type ContractLocation = {
    chain: string,
    address: string
}
  
export type ContractWrapper =
    ContractLocation & {
    contract: CheckedContract
};
  
export interface ContractLocationMap {
    [id: string]: ContractLocation;
}

export interface ContractWrapperMap {
    [id: string]: ContractWrapper;
}

export type SessionMaps = {
    inputFiles: PathBufferMap;
    pendingContracts: ContractWrapperMap;
};

export type MySession = 
    Session &
    SessionMaps & { 
    unusedSources: string[],
    started: boolean
};

export interface MatchMap {
    [id: string]: Match;
}

export function isValidContract(contract: CheckedContract) {
    return isEmpty(contract.missing) && isEmpty(contract.invalid) && Boolean(contract.compilerVersion);
}

export function getSessionJSON(session: MySession) {
    const inputFiles: StringMap = {};
    for (const id in (session.inputFiles || {})) {
        inputFiles[id] = session.inputFiles[id].path;
    }

    const contracts: any = {};
    for (const id in (session.pendingContracts || {})) {
        contracts[id] = session.pendingContracts[id].contract.getSendableJSON();
    }

    const unused = session.unusedSources || [];
    return { inputFiles, contracts, unused };
}

export function generateId(obj: any): string {
    return Web3.utils.keccak256(JSON.stringify(obj));
    // return `${Date.now()}-${Math.random.toString().slice(2)}`;
}