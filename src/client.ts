import * as vscode from 'vscode';
import * as path from "path";
import { exec } from 'child_process';

import {
LanguageClient,
LanguageClientOptions,
ServerOptions,
TransportKind
} from 'vscode-languageclient';

let client: LanguageClient;

export function activate(context: vscode.ExtensionContext) {

	let disposable = vscode.commands.registerCommand('alioth.initiateworkspace', () => {
		var folders = vscode.workspace.workspaceFolders;
		if( folders ) {
			var cmd = "alioth --init " + folders[0].uri.path;
			exec(cmd);
		}
	});

	context.subscriptions.push(disposable);

	// The server is implemented in node
	let serverModule = context.asAbsolutePath(
		path.join('out', 'server.js')
	);
	// The debug options for the server
	// --inspect=6009: runs the server in Node's Inspector mode so VS Code can attach to the server for debugging
	let debugOptions = { execArgv: ['--nolazy', '--inspect=6009'] };

	// If the extension is launched in debug mode then the debug server options are used
	// Otherwise the run options are used
	let serverOptions: ServerOptions = {
		run: { module: serverModule, transport: TransportKind.ipc },
		debug: {
			module: serverModule,
			transport: TransportKind.ipc,
			options: debugOptions
		}
	};

	// Options to control the language client
	let clientOptions: LanguageClientOptions = {
		documentSelector: [{
			language: "alioth",
			scheme: "file"
		}],
		synchronize: {
			// Notify the server about file changes to '.clientrc files contained in the workspace
			fileEvents: vscode.workspace.createFileSystemWatcher('**/.clientrc'),
			configurationSection: 'AliothLanguageServer'
		}
	};

	// Create the language client and start the client.
	client = new LanguageClient(
		'aliothLanguageServer',
		'Alioth Language Server',
		serverOptions,
		clientOptions
	);

	// Start the client. This will also launch the server
	let disposable_client = client.start();

	context.subscriptions.push(disposable_client);
}

// this method is called when your extension is deactivated
export function deactivate() {
	if (!client) {
		return undefined;
	}
	return client.stop();
}
