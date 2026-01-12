declare global {
	function __VITE_ENVIRONMENT_RUNNER_IMPORT__(
		environmentName: string,
		id: string
	): Promise<unknown>;
}

export default {
	async fetch(request) {
		const url = new URL(request.url);

		switch (url.pathname) {
			case "/child-import": {
				const childModule = (await __VITE_ENVIRONMENT_RUNNER_IMPORT__(
					"child",
					"virtual:child-module"
				)) as { getMessage: () => string };

				return new Response(childModule.getMessage(), { status: 200 });
			}
		}

		return new Response("Please specify a test path", { status: 400 });
	},
} satisfies ExportedHandler;
