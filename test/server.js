process.env.TESTING = true;
process.env.LOCALCHAIN_URL = "http://localhost:8545";
process.env.MOCK_REPOSITORY = './dist/data/mock-repository';
process.env.MOCK_DATABASE = './dist/data/mock-database';

const chai = require("chai");
const chaiHttp = require("chai-http");
const Server = require("../dist/server/server").Server;
const util = require("util");
const fs = require("fs");
const rimraf = require("rimraf");
const path = require("path");
chai.use(chaiHttp);

// howto: https://www.digitalocean.com/community/tutorials/test-a-node-restful-api-with-mocha-and-chai
// howto-sessions: https://stackoverflow.com/questions/39662286/mocha-chai-request-and-express-session

describe("Server", async () => {
    const server = new Server();
    const promisified = util.promisify(server.app.listen);
    await promisified(server.port);
    console.log(`Injector listening on port ${server.port}!`);

    beforeEach(() => {
        rimraf.sync(process.env.MOCK_REPOSITORY);
    });

    after(() => {
        rimraf.sync(process.env.MOCK_REPOSITORY);
    });

    const sourcePath = path.join("test", "testcontracts", "1_Storage", "1_Storage.sol");
    const metadataPath = path.join("test", "testcontracts", "1_Storage", "metadata.json");
    const contractChain = "100"; // xdai
    const contractAddress = "0x656d0062eC89c940213E3F3170EA8b2add1c0143";

    describe("/checkByAddress", () => {
        it("should fail for missing chainIds", (done) => {
            chai.request(server.app)
                .get("/checkByAddresses")
                .query({ addresses: "0x123" })
                .end((err, res) => {
                    chai.expect(err).to.be.null;
                    chai.expect(res.status).to.equal(400);
                    const errorMessage = res.body.error.toLowerCase();
                    chai.expect(errorMessage).to.contain("chainids");
                    chai.expect(errorMessage).to.not.contain("addresses");
                    done();
                });
        });

        it("should fail for missing addresses", (done) => {
            chai.request(server.app)
                .get("/checkByAddresses")
                .query({ chainIds: 1 })
                .end((err, res) => {
                    chai.expect(err).to.be.null;
                    chai.expect(res.status).to.equal(400);
                    const errorMessage = res.body.error.toLowerCase();
                    chai.expect(errorMessage).to.contain("addresses");
                    chai.expect(errorMessage).to.not.contain("chainids");
                    done();
                });
        });

        const assertStatus = (err, res, expectedStatus, done) => {
            chai.expect(err).to.be.null;
            chai.expect(res.status).to.equal(200);
            const resultArray = res.body;
            chai.expect(resultArray).to.have.a.lengthOf(1);
            const result = resultArray[0];
            chai.expect(result.address).to.equal(contractAddress);
            chai.expect(result.status).to.equal(expectedStatus);
            if (done) done();
        }

        it("should return false for previously unverified contract", (done) => {
            chai.request(server.app)
                .get("/checkByAddresses")
                .query({ chainIds: 100, addresses: contractAddress })
                .end((err, res) => assertStatus(err, res, "false", done));
        });

        it("should fail for invalid address", (done) => {
            chai.request(server.app)
                .get("/checkByAddresses")
                .query({ chainIds: contractChain, addresses: "0x656d0062eC89c940213E3F3170EA8b2add1c0142" })
                .end((err, res) => {
                    chai.expect(err).to.be.null;
                    chai.expect(res.status).to.equal(400);
                    const errorMessage = res.body.error.toLowerCase();
                    chai.expect(errorMessage).to.contain("invalid");
                    chai.expect(errorMessage).to.contain("address");
                    done();
                });
        });

        it("should return true for previously verified contract", (done) => {
            const agent = chai.request.agent(server.app);
            agent.get("/checkByAddresses")
                .query({ chainIds: 100, addresses: contractAddress })
                .end((err, res) => {
                    assertStatus(err, res, "false");
                    agent.post("/")
                        .field("address", contractAddress)
                        .field("chain", contractChain)
                        .attach("files", fs.readFileSync(metadataPath), "metadata.json")
                        .attach("files", fs.readFileSync(sourcePath))
                        .end((err, res) => {
                            chai.expect(err).to.be.null;
                            chai.expect(res.status).to.equal(200);

                            agent.get("/checkByAddresses")
                                .query({ chainIds: 100, addresses: contractAddress })
                                .end((err, res) => assertStatus(err, res, "perfect", done));
                        });     
                });
        });
    });

    describe("/", () => {
        it("should correctly inform for an address check of a non verified contract", (done) => {
            chai.request(server.app)
                .post("/")
                .field("chain", contractChain)
                .field("address", contractAddress)
                .end((err, res) => {
                    chai.expect(err).to.be.null;
                    chai.expect(res.body).to.haveOwnProperty("error");
                    // const errorMessage = res.body.error.toLowerCase(); // TODO should the message be checked and how?
                    chai.expect(res.status).to.equal(404);
                    done();
                });
        });

        const assertions = (err, res, done) => {
            chai.expect(err).to.be.null;
            chai.expect(res.status).to.equal(200);
            chai.expect(res.body).to.haveOwnProperty("result");
            const resultArr = res.body.result;
            chai.expect(resultArr).to.have.a.lengthOf(1);
            const result = resultArr[0];
            chai.expect(result.address).to.equal(contractAddress);
            chai.expect(result.status).to.equal("perfect");
            done();
        }

        it("should verify multipart upload", (done) => {
            chai.request(server.app)
                .post("/")
                .field("address", contractAddress)
                .field("chain", contractChain)
                .attach("files", fs.readFileSync(metadataPath), "metadata.json")
                .attach("files", fs.readFileSync(sourcePath))
                .end((err, res) => assertions(err, res, done));
        });

        it("should verify json upload", (done) => {
            chai.request(server.app)
                .post("/")
                .send({
                    address: contractAddress,
                    chain: contractChain,
                    files: {
                        "metadata.json": fs.readFileSync(metadataPath).toString(),
                        "1_Storage.sol": fs.readFileSync(sourcePath).toString()
                    }
                })
                .end((err, res) => assertions(err, res, done));
        });

        it("should return Bad Request for missing file", (done) => {
            chai.request(server.app)
                .post("/")
                .field("address", contractAddress)
                .field("chain", contractChain)
                .attach("files", fs.readFileSync(metadataPath), "metadata.json")
                .end((err, res) => {
                    chai.expect(err).to.be.null;
                    chai.expect(res.body).to.haveOwnProperty("error");
                    const errorMessage = res.body.error.toLowerCase();
                    chai.expect(res.status).to.equal(400);
                    chai.expect(errorMessage).to.include("missing");
                    chai.expect(errorMessage).to.include("1_Storage.sol".toLowerCase());
                    done();
                });
        });
    });
});

// process.env.TESTING = true;
// process.env.LOCALCHAIN_URL = "http://localhost:8545";
// process.env.MOCK_REPOSITORY = './mockRepository';
// process.env.MOCK_DATABASE = './mockDatabase';

// const assert = require('assert');
// const chai = require('chai');
// const chaiHttp = require('chai-http');
// const ganache = require('ganache-cli');
// const exec = require('child_process').execSync;
// const pify = require('pify');
// const Web3 = require('web3');
// const read = require('fs').readFileSync;
// const util = require('util');
// const path = require('path');

// const app = require('../src/server/server').default;
// const { deployFromArtifact } = require('./helpers/helpers');

// const Simple = require('./sources/pass/simple.js');
// const { FileService } = require('sourcify-core');
// const simpleMetadataPath = './test/sources/all/simple.meta.json';
// const simpleSourcePath = './test/sources/all/Simple.sol';
// const simpleMetadataJSONPath = './test/sources/metadata/simple.meta.object.json';
// const importSourcePath = './test/sources/all/Import.sol';
// const simpleWithImportSourcePath = './test/sources/all/SimpleWithImport.sol';
// const simpleWithImportMetadataPath = './test/sources/all/simpleWithImport.meta.json';

// chai.use(chaiHttp);

// describe("server", function () {
//   this.timeout(50000);

//   let server;
//   let web3;
//   let simpleInstance;
//   let serverAddress = 'http://localhost:5000';
//   let fileservice = new FileService();
//   let chainId = fileservice.getChainId('localhost');

//   before(async function () {
//     server = ganache.server({ chainId: chainId });
//     await pify(server.listen)(8545);
//     web3 = new Web3(process.env.LOCALCHAIN_URL);
//     simpleInstance = await deployFromArtifact(web3, Simple);
//   });

//   // Clean up repository
//   afterEach(function () {
//     try { exec(`rm -rf ${process.env.MOCK_REPOSITORY}`) } catch (err) { /*ignore*/ }
//   })

//   // Clean up server
//   after(async function () {
//     await pify(server.close)();
//   });

//   it("when submitting a valid request (stringified metadata)", function (done) {
//     const expectedPath = path.join(
//       process.env.MOCK_REPOSITORY,
//       'contracts',
//       'full_match',
//       chainId.toString(),
//       simpleInstance.options.address,
//       'metadata.json'
//     );

//     const submittedMetadata = read(simpleMetadataPath, 'utf-8');

//     chai.request(serverAddress)
//       .post('/')
//       .attach("files", read(simpleMetadataPath), "simple.meta.json")
//       .attach("files", read(simpleSourcePath), "Simple.sol")
//       .field("address", simpleInstance.options.address)
//       .field("chain", 'localhost')
//       .end(function (err, res) {
//         assert.equal(err, null);
//         assert.equal(res.status, 200);

//         // Reponse should be array of matches
//         const text = JSON.parse(res.text);
//         assert.equal(text.result[0].status, 'perfect');
//         assert.equal(text.result[0].address, simpleInstance.options.address);

//         // Verify sources were written to repo
//         const saved = JSON.stringify(read(expectedPath, 'utf-8'));
//         assert.equal(saved, submittedMetadata.trim());
//         done();
//       });
//   });

//   it("when submitting a valid request (json formatted metadata)", function (done) {
//     const expectedPath = path.join(
//       process.env.MOCK_REPOSITORY,
//       'contracts',
//       'full_match',
//       chainId.toString(),
//       simpleInstance.options.address,
//       'metadata.json'
//     );

//     // The injector will save a stringified version
//     const stringifiedMetadata = read(simpleMetadataPath, 'utf-8');

//     chai.request(serverAddress)
//       .post('/')
//       .attach("files", read(simpleMetadataJSONPath), "simple.meta.object.json")
//       .attach("files", read(simpleSourcePath), "Simple.sol")
//       .field("address", simpleInstance.options.address)
//       .field("chain", 'localhost')
//       .end(function (err, res) {
//         assert.equal(err, null);
//         assert.equal(res.status, 200);

//         // Verify sources were written to repo
//         const saved = JSON.stringify(read(expectedPath, 'utf-8'));
//         assert.equal(saved, stringifiedMetadata.trim());
//         done();
//       });
//   });

//   it("when submitting and bytecode does not match (error)", function (done) {
//     chai.request(serverAddress)
//       .post('/')
//       .attach("files", read(simpleWithImportMetadataPath), "simpleWithImport.meta.json")
//       .attach("files", read(simpleWithImportSourcePath), "SimpleWithImport.sol")
//       .attach("files", read(importSourcePath), "Import.sol")
//       .field("address", simpleInstance.options.address)
//       .field("chain", 'localhost')
//       .end(function (err, res) {
//         assert.equal(err, null);
//         assert.equal(res.status, 404);
//         const result = JSON.parse(res.text);
//         assert(result.error.includes("Could not match on-chain deployed bytecode"));
//         done();
//       });
//   });

//   it("when submitting a single metadata file (error)", function (done) {
//     chai.request(serverAddress)
//       .post('/')
//       .attach("files", read(simpleMetadataPath), "simple.meta.json")
//       .field("address", simpleInstance.options.address)
//       .field("chain", 'localhost')
//       .end(function (err, res) {
//         assert.equal(err, null);
//         assert.equal(res.status, 500);
//         assert(res.error.text.includes('metadata file mentions a source file'));
//         assert(res.error.text.includes('cannot be found in your upload'));
//         done();
//       });
//   });

//   it("when submitting a single source file (error)", function (done) {
//     chai.request(serverAddress)
//       .post('/')
//       .attach("files", read(simpleSourcePath), "Simple.sol")
//       .field("address", simpleInstance.options.address)
//       .field("chain", 'localhost')
//       .end(function (err, res) {
//         assert.equal(err, null);
//         assert.equal(res.status, 500);
//         assert(res.error.text.includes('Metadata file not found'));
//         done();
//       });
//   });

//   it("when submitting without an address (error)", function (done) {
//     chai.request(serverAddress)
//       .post('/')
//       .attach("files", read(simpleMetadataPath), "simple.meta.json")
//       .attach("files", read(simpleSourcePath), "Simple.sol")
//       .field("chain", 'localhost')
//       .end(function (err, res) {
//         assert.equal(err, null);
//         assert.equal(res.status, 500);
//         assert(res.error.text.includes('Missing address'));
//         done();
//       });
//   });

//   it("when submitting without a chain name (error)", function (done) {
//     chai.request(serverAddress)
//       .post('/')
//       .attach("files", read(simpleMetadataPath), "simple.meta.json")
//       .attach("files", read(simpleSourcePath), "Simple.sol")
//       .field("address", simpleInstance.options.address)
//       .end(function (err, res) {
//         assert.equal(err, null);
//         assert.equal(res.status, 404);
//         assert(res.error.text.includes('Chain undefined not supported'));
//         done();
//       });
//   });

//   it("get /health", function (done) {
//     chai.request(serverAddress)
//       .get('/health')
//       .end(function (err, res) {
//         assert.equal(err, null);
//         assert.equal(res.status, 200);
//         assert(res.text.includes('Alive and kicking!'))
//         done();
//       });
//   });

//   describe("when submitting only an address / chain pair", function () {

//     // Setup: write "Simple.sol" to repo
//     beforeEach(function (done) {
//       chai.request(serverAddress)
//         .post('/')
//         .attach("files", read(simpleMetadataPath), "simple.meta.json")
//         .attach("files", read(simpleSourcePath), "Simple.sol")
//         .field("address", simpleInstance.options.address)
//         .field("chain", 'localhost')
//         .end(function (err, res) {
//           assert.equal(res.status, 200);
//           done();
//         });
//     });

//     afterEach(function () {
//       try { exec(`rm -rf ${process.env.MOCK_REPOSITORY}`) } catch (err) { /*ignore*/ }
//     });

//     it("when address / chain exist (success)", function (done) {
//       chai.request(serverAddress)
//         .post('/')
//         .field("address", simpleInstance.options.address)
//         .field("chain", 'localhost')
//         .end(function (err, res) {
//           assert.equal(err, null);
//           assert.equal(res.status, 200);

//           const text = JSON.parse(res.text);
//           assert.equal(text.result[0].status, 'perfect');
//           assert.equal(text.result[0].address, simpleInstance.options.address);

//           done();
//         });
//     });

//     it("when chain does not exist (error)", function (done) {
//       chai.request(serverAddress)
//         .post('/')
//         .field("address", simpleInstance.options.address)
//         .field("chain", 'bitcoin_diamond_lottery')
//         .end(function (err, res) {
//           assert.equal(err, null);
//           assert.equal(res.status, 404);

//           const result = JSON.parse(res.text);
//           assert.equal(result.error, "Chain bitcoin_diamond_lottery not supported!");
//           done();
//         });
//     });

//     it("when address does not exist (error)", function (done) {
//       chai.request(serverAddress)
//         .post('/')
//         .field("address", "0xabcde")
//         .field("chain", 'localhost')
//         .end(function (err, res) {
//           assert.equal(err, null);
//           assert.equal(res.status, 404);

//           const result = JSON.parse(res.text);
//           assert.equal(result.error, "Address for specified chain not found in repository");
//           done();
//         });
//     });

//     it("when light endpoint is used", function (done) {
//       chai.request(serverAddress)
//         .get('/checkByAddresses')
//         .query({addresses: simpleInstance.options.address + ",0x0000A906D248Cc99FB8CB296C8Ad8C6Df05431c9", chainIds: "1337"})
//         .end(function (err, res) {
//           assert.equal(err, null);
//           const result = JSON.parse(res.text);
//           assert.equal(result[0].status, "perfect");
//           assert.equal(result[1].status, "false");
//           done();
//         })
//     })
//   });
// });
