import { Session } from 'express-session';
import { Match, PathBuffer, CheckedContract } from '@ethereum-sourcify/core';

export interface PathBufferMap {
    [id: string]: PathBuffer;
}

export type ContractLocation = {
    chain: string,
    address: string
}
  
export type ContractWrapper =
    ContractLocation & {
    contract: CheckedContract,
    compilerVersion: string,
    valid: boolean
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


export function getSessionJSON(session: MySession) {
    return {
        inputFiles: session.inputFiles,
        contracts: session.pendingContracts,
        unused: session.unusedSources
    };
}