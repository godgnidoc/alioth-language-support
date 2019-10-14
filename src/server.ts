/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

//import Uri from "vscode-uri";
import {
	createConnection,
	TextDocuments,
	Diagnostic,
	ProposedFeatures,
	InitializeParams,
	DidChangeConfigurationNotification,
	CompletionItem,
	CompletionItemKind,
	TextDocumentPositionParams,
	Position,
	TextDocumentChangeEvent,
	DiagnosticSeverity
} from 'vscode-languageserver';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';
import os = require('os');
import fs = require('fs');
import URI from 'vscode-uri';

// Create a connection for the server. The connection uses Node's IPC as a transport.
// Also include all preview / proposed LSP features.
let connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager. The text document manager
// supports full document sync only
let documents: TextDocuments = new TextDocuments();

let hasConfigurationCapability: boolean = false;
let hasWorkspaceFolderCapability: boolean = false;
let hasDiagnosticRelatedInformationCapability: boolean = false;

connection.onInitialize((params: InitializeParams) => {
	let capabilities = params.capabilities;
	
	// Does the client support the `workspace/configuration` request?
	// If not, we will fall back using global settings
	hasConfigurationCapability = !!(capabilities.workspace && !!capabilities.workspace.configuration);
	hasWorkspaceFolderCapability = !!(capabilities.workspace && !!capabilities.workspace.workspaceFolders);
	hasDiagnosticRelatedInformationCapability =
	!!(capabilities.textDocument &&
		capabilities.textDocument.publishDiagnostics &&
		capabilities.textDocument.publishDiagnostics.relatedInformation);
		
	return {
		capabilities: {
			textDocumentSync: documents.syncKind,
			// Tell the client that the server supports code completion
			completionProvider: {
				resolveProvider: true
			}
		}
	};
});

connection.onInitialized(async () => {

	initializeCompiler();

	if (hasConfigurationCapability) {
		// Register for all configuration changes.
		connection.client.register(
			DidChangeConfigurationNotification.type,
			undefined
		);
	}
	if (hasWorkspaceFolderCapability) {
		connection.workspace.onDidChangeWorkspaceFolders(_event => {
			connection.console.log('Workspace folder change event received.');
		});
	}
	connection.console.info("Alioth Language Server started.");
});

// The example settings
interface ExampleSettings {
	maxNumberOfProblems: number;
}

// The global settings, used when the `workspace/configuration` request is not supported by the client.
// Please note that this is not the case when using this server with the client provided in this example
// but could happen with other clients.
const defaultSettings: ExampleSettings = { maxNumberOfProblems: 1000 };
let globalSettings: ExampleSettings = defaultSettings;

// Cache the settings of all open documents
let documentSettings: Map<string, Thenable<ExampleSettings>> = new Map();

connection.onDidChangeConfiguration(change => {
	if (hasConfigurationCapability) {
		// Reset all cached document settings
		documentSettings.clear();
	} else {
		globalSettings = <ExampleSettings>(
			(change.settings.languageServerExample || defaultSettings)
		);
	}

	// Revalidate all open text documents
	validateDocuments(null); // documents.all().forEach(validateTextDocument);
});

function getDocumentSettings(resource: string): Thenable<ExampleSettings> {
	if (!hasConfigurationCapability) {
		return Promise.resolve(globalSettings);
	}
	let result = documentSettings.get(resource);
	if (!result) {
		result = connection.workspace.getConfiguration({
			scopeUri: resource,
			section: 'LanguageServerExample'
		});
		documentSettings.set(resource, result);
	}
	return result;
}

// Only keep settings for open documents
documents.onDidClose(e => {
	documentSettings.delete(e.document.uri);
});

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
// documents.onDidOpen(validateDocuments);
// documents.onDidSave(validateDocuments);
documents.onDidChangeContent(validateDocuments);

connection.onDidChangeWatchedFiles(_change => {
	// Monitored files have change in VSCode
	connection.console.log('We received an file change event');
});

// This handler provides the initial list of the completion items.
connection.onCompletion(
	(_textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
		// The pass parameter contains the position of the text document in
		// which code complete got requested. For the example we ignore this
		// info and always provide the same completion items.
		return [
			{
				label: 'TypeScript',
				kind: CompletionItemKind.Text,
				data: 1
			},
			{
				label: 'JavaScript',
				kind: CompletionItemKind.Text,
				data: 2
			}
		];
	}
);

// This handler resolve additional information for the item selected in
// the completion list.
connection.onCompletionResolve(
	(item: CompletionItem): CompletionItem => {
		if (item.data === 1) {
			(item.detail = 'TypeScript details'),
				(item.documentation = 'TypeScript documentation');
		} else if (item.data === 2) {
			(item.detail = 'JavaScript details'),
				(item.documentation = 'JavaScript documentation');
		}
		return item;
	}
);

// the connection to the compiler
let compiler : ChildProcess = undefined;
function initializeCompiler() {
	compiler = spawn("alioth", ["v:", "0", "---", "0/1"] );
	compiler.stdout.on("data", onCompilerOutput);
	compiler.on("close", (code: number, signal: string) => {
		connection.console.log("Compiler exited:("+code+"):"+signal);
	});
	connection.console.log("Compiler started in interactive mode");
}

function onCompilerOutput( message ) {
	let msg = null;
	try {
		msg = JSON.parse(message);
		if (msg === null || typeof msg !== 'object') {return;}
	} catch {return;}
	
	if( msg.action === "request" ) {
		processRequest(msg);
	} else if( msg.action === "respond" ) {
		processRespond(msg);
	}
}

async function processRequest( request ) {
	if (request.title === "content") {
		let uri: string = request.uri;
		let doc = documents.get(uri);
		if (doc === undefined) {
			respondFailure(request);
			return;
		} else {
			respondContent(request.seq, doc.getText());
		}
	} else if( request.title === "contents" ) {
		let data = {};
		let cur_time = os.uptime();
		let dir_path = URI.parse(request.uri).fsPath;
		let ents = fs.readdirSync(dir_path,{withFileTypes:true});
		for( let ent of ents ) {
			let obj = {};
			if( ent.isDirectory() ) {
				obj["dir"] = true;
			} else {
				obj["dir"] = false;
				let file_path = path.join(dir_path,ent.name);
				let doc = documents.get(URI.file(file_path).toString());
				if( doc === undefined ) {
					let st = fs.statSync(file_path);
					obj["size"] = st.size;
					obj["mtime"] = st.mtime.getTime();
				} else {
					obj["size"] = 1;
					obj["mtime"] = cur_time;
				}
			}
			data[ent.name] = obj;
		}
		respondContents(request.seq, data);
	} else {
		return;
	}
}

function processRespond( respond ) {
	if (respond.title === "diagnostics") {
		if( Array.isArray(respond.diagnostics) ) {
			diagnosticsProcesser(respond.diagnostics);
		}
	} else {
		return;
	}
}

function requestDiagnostics( targets : string[] = [] ) : number {
	let pack = {
		title: "diagnostics",
		targets: targets
	};
	return sendRequest( pack );
}

function requestWorkspace( uri : string ) : number {
	let pack = {
		title: "workspace",
		uri: uri
	};
	return sendRequest( pack );
}

function respondContent( seq : number, data : string ) {
	let pack = {
		title: "content",
		status: 0,
		data: data
	};
	sendRespond( seq, pack );
}

function respondContents( seq : number, data : object ) {
	let pack = {
		title: "contents",
		status: 0,
		data: data
	};
	sendRespond( seq, pack );
}

function respondFailure( request ) {
	let pack = {
		title: request.title,
		status: 1
	};
	sendRespond(request.seq, pack );
}

let global_req = 1;
function sendRequest( pack ) : number {
	pack.action = "request";
	pack.seq = global_req++;
	sendPackage(pack);
	return pack.seq;
}

function sendRespond( seq : number, pack ) {
	pack.action = "respond";
	pack.seq = seq;
	sendPackage(pack);
}

function sendPackage( pack ) {
	pack.timestamp = os.uptime();
	let str = JSON.stringify(pack)+"\n";
	compiler.stdin.write(str, (e)=>{});
	// connection.console.log("Package sent to compiler: " + str );
}

let workspace_set = false;
async function validateDocuments(change: TextDocumentChangeEvent) {
	if( !workspace_set ) {
		workspace_set = true;
		let folders = await connection.workspace.getWorkspaceFolders();
		requestWorkspace(folders[0].uri);
	}
	requestDiagnostics();
}

type CompilerDiagnostic = {
	severity: DiagnosticSeverity,
	prefix: string,
	error_code: string,
	message: string,
	begin_line: number,
	begin_column: number,
	end_line: number,
	end_column: number,
	informations: CompilerDiagnostic[]
};

let diagnosticsMap : object = {};
function diagnosticsProcesser(log: CompilerDiagnostic[] ) {

	for( let key in diagnosticsMap ) { diagnosticsMap[key] = []; }

	for( let element of log ) {
		let diagnostics: Diagnostic[] = diagnosticsMap[element.prefix];
		if (diagnostics === undefined) { diagnostics = diagnosticsMap[element.prefix] = []; }
		let diagnostic: Diagnostic = {
			severity: element.severity,
			range: {
				start: Position.create(element.begin_line - 1, element.begin_column - 1),
				end: Position.create(element.end_line - 1, element.end_column - 1)
			},
			message: element.message,
			source: 'alioth'
		};

		if (hasDiagnosticRelatedInformationCapability) {
			diagnostic.relatedInformation = [];
			for( let sub of element.informations) {
				let subd = {
					location: {
						uri: path.resolve(sub.prefix),
						range: {
							start: Position.create(sub.begin_line - 1, sub.begin_column - 1),
							end: Position.create(sub.end_line - 1, sub.end_column - 1)
						}
					},
					message: sub.message
				};
				diagnostic.relatedInformation.push(subd);
			}
		}
		diagnostics.push(diagnostic);
	}

	// Send the computed diagnostics to VSCode.
	for (let key in diagnosticsMap) {
		connection.sendDiagnostics({ uri: key, diagnostics: diagnosticsMap[key] });
	}
}

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();