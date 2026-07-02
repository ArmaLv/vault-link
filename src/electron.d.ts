declare module "electron" {
	interface OpenDialogOptions {
		defaultPath?: string;
		properties?: string[];
	}
	interface OpenDialogReturnValue {
		canceled: boolean;
		filePaths: string[];
	}
	export const remote: {
		dialog: {
			showOpenDialog(options: OpenDialogOptions): Promise<OpenDialogReturnValue>;
		};
	};
}
