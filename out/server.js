"use strict";
/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
Object.defineProperty(exports, "__esModule", { value: true });
const vscode_languageserver_1 = require("vscode-languageserver");
const path = require("path");
const vscode_uri_1 = require("vscode-uri");
const child_process_1 = require("child_process");
const util_1 = require("util");
// Create a connection for the server. The connection uses Node's IPC as a transport.
// Also include all preview / proposed LSP features.
let connection = vscode_languageserver_1.createConnection(vscode_languageserver_1.ProposedFeatures.all);
// Create a simple text document manager. The text document manager
// supports full document sync only
let documents = new vscode_languageserver_1.TextDocuments();
let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
let hasDiagnosticRelatedInformationCapability = false;
connection.onInitialize((params) => {
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
            // documentHighlightProvider : true,
            // Tell the client that the server supports code completion
            completionProvider: {
                resolveProvider: true
            }
        }
    };
});
connection.onInitialized(() => {
    if (hasConfigurationCapability) {
        // Register for all configuration changes.
        connection.client.register(vscode_languageserver_1.DidChangeConfigurationNotification.type, undefined);
    }
    if (hasWorkspaceFolderCapability) {
        connection.workspace.onDidChangeWorkspaceFolders(_event => {
            connection.console.log('Workspace folder change event received.');
        });
    }
    connection.console.info("Alioth Language Server started.");
});
// The global settings, used when the `workspace/configuration` request is not supported by the client.
// Please note that this is not the case when using this server with the client provided in this example
// but could happen with other clients.
const defaultSettings = { maxNumberOfProblems: 1000 };
let globalSettings = defaultSettings;
// Cache the settings of all open documents
let documentSettings = new Map();
connection.onDidChangeConfiguration(change => {
    if (hasConfigurationCapability) {
        // Reset all cached document settings
        documentSettings.clear();
    }
    else {
        globalSettings = ((change.settings.languageServerExample || defaultSettings));
    }
    // Revalidate all open text documents
    validateDocuments(null); // documents.all().forEach(validateTextDocument);
});
function getDocumentSettings(resource) {
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
let diagnosticsMap = {};
function validateDocuments(change) {
    connection.workspace.getWorkspaceFolders().then(function (folders) {
        let proc = child_process_1.spawn("aliothc", ["--semantic-check", "--ask-input", "--work", vscode_uri_1.default.parse(folders[0].uri).fsPath]);
        proc.stdout.on("data", function (message) {
            let msg = null;
            try {
                msg = JSON.parse(message);
                if (!util_1.isObject(msg)) {
                    proc.stdin.write(JSON.stringify({}));
                    proc.stdin.write("\n");
                    return;
                }
            }
            catch (_a) {
                proc.stdin.write(JSON.stringify({}));
                proc.stdin.write("\n");
                return;
            }
            if (msg.cmd === "ask for input") {
                let pat = msg.path;
                if (!path.isAbsolute(pat)) {
                    pat = path.resolve(pat);
                }
                let doc = documents.get(vscode_uri_1.default.file(pat).toString());
                if (util_1.isUndefined(doc)) {
                    proc.stdin.write(JSON.stringify({}));
                    proc.stdin.write("\n");
                    return;
                }
                proc.stdin.write(JSON.stringify(doc.getText()));
                proc.stdin.write("\n");
            }
            else if (msg.cmd === "diagnostic") {
                logProcessor(msg.log);
            }
        });
    });
}
function logProcessor(log) {
    for (let key in diagnosticsMap) {
        diagnosticsMap[key] = [];
    }
    log.forEach(element => {
        let diagnostics = diagnosticsMap[element.pat];
        if (diagnostics === undefined) {
            diagnostics = diagnosticsMap[element.pat] = [];
        }
        let diagnostic = {
            severity: element.sev,
            range: {
                start: vscode_languageserver_1.Position.create(element.begl - 1, element.begc - 1),
                end: vscode_languageserver_1.Position.create(element.endl - 1, element.endc - 1)
            },
            message: element.msg,
            source: 'alioth'
        };
        if (hasDiagnosticRelatedInformationCapability) {
            diagnostic.relatedInformation = [];
            element.sub.forEach(sub => {
                let subd = {
                    location: {
                        uri: path.resolve(sub.pat),
                        range: {
                            start: vscode_languageserver_1.Position.create(sub.begl - 1, sub.begc - 1),
                            end: vscode_languageserver_1.Position.create(sub.endl - 1, sub.endc - 1)
                        }
                    },
                    message: sub.msg
                };
                diagnostic.relatedInformation.push(subd);
            });
        }
        diagnostics.push(diagnostic);
    });
    // Send the computed diagnostics to VSCode.
    for (let key in diagnosticsMap) {
        connection.sendDiagnostics({ uri: path.resolve(key), diagnostics: diagnosticsMap[key] });
    }
}
connection.onDidChangeWatchedFiles(_change => {
    // Monitored files have change in VSCode
    connection.console.log('We received an file change event');
});
// This handler provides the initial list of the completion items.
connection.onCompletion((_textDocumentPosition) => {
    // The pass parameter contains the position of the text document in
    // which code complete got requested. For the example we ignore this
    // info and always provide the same completion items.
    return [
        {
            label: 'TypeScript',
            kind: vscode_languageserver_1.CompletionItemKind.Text,
            data: 1
        },
        {
            label: 'JavaScript',
            kind: vscode_languageserver_1.CompletionItemKind.Text,
            data: 2
        }
    ];
});
// This handler resolve additional information for the item selected in
// the completion list.
connection.onCompletionResolve((item) => {
    if (item.data === 1) {
        (item.detail = 'TypeScript details'),
            (item.documentation = 'TypeScript documentation');
    }
    else if (item.data === 2) {
        (item.detail = 'JavaScript details'),
            (item.documentation = 'JavaScript documentation');
    }
    return item;
});
// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);
// Listen on the connection
connection.listen();
//# sourceMappingURL=server.js.map