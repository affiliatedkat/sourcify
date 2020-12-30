import { Session } from 'express-session';
import { PathBuffer, CheckedContract, isEmpty  } from '@ethereum-sourcify/core';
import Web3 from 'web3';

export interface PathBufferMap {
    [id: string]: PathBuffer;
}

export type ContractLocation = {
    chain: string,
    address: string
}

export type ContractMeta = {
    compilerVersion?: string,
    address?: string,
    networkId?: string,
    status?: Status,
    statusMessage?: string
}

export type ContractWrapper =
    ContractMeta & {
    contract: CheckedContract
}
export interface ContractWrapperMap {
    [id: string]: ContractWrapper;
}

export type SessionMaps = {
    inputFiles: PathBufferMap;
    contractWrappers: ContractWrapperMap;
};

export type MySession = 
    Session &
    SessionMaps & { 
    unusedSources: string[],
    started: boolean
};

export type Status = "perfect" | "partial" | "error";

export type SendableContract =
    ContractMeta & {
    files: {
        found: string[],
        missing: string[]
    },
    verificationId?: string
}

export function isVerifiable(contractWrapper: ContractWrapper) {
    const contract = contractWrapper.contract;
    return isEmpty(contract.missing)
        && isEmpty(contract.invalid)
        && Boolean(contractWrapper.compilerVersion)
        && Boolean(contractWrapper.address)
        && Boolean(contractWrapper.networkId)
        && (contractWrapper.status !== "partial" && contractWrapper.status !== "perfect"); // not already verified
}

export function getSessionJSON(session: MySession) {
    const contractWrappers = session.contractWrappers || {};
    const contracts: SendableContract[] = [];
    for (const id in contractWrappers) {
        const contractWrapper = contractWrappers[id];
        const sendableContract: SendableContract = contractWrapper.contract.getSendableJSON();
        sendableContract.verificationId = id;
        contracts.push(sendableContract);
    }

    const unused = session.unusedSources || [];
    return { contracts, unused };
}

export function generateId(obj: any): string {
    return Web3.utils.keccak256(JSON.stringify(obj));
}

export function updateUnused(unused: string[], session: MySession) {
    if (!session.unusedSources) {
        session.unusedSources = [];
    }
    session.unusedSources = unused;
}