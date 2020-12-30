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

export type ContractMeta = {
    compilerVersion: string,
    chain: string,
    address: string,
}

export interface ContractMetaMap {
    [id: string]: ContractMeta;
}

export function isVerifiable(contractWrapper: ContractWrapper) {
    const contract = contractWrapper.contract;
    return isEmpty(contract.missing)
        && isEmpty(contract.invalid)
        && Boolean(contract.compilerVersion)
        && Boolean(contractWrapper.address)
        && Boolean(contractWrapper.chain);
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
}