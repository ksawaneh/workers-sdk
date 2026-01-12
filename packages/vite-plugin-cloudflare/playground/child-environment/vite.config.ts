import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [
		{
			name: "child-module",
			resolveId(source) {
				if (source === "virtual:child-module") {
					return "\0virtual:child-module";
				}
			},
			load(id) {
				if (id === "\0virtual:child-module") {
					return `export function getMessage() { return "Hello from ${this.environment.name} environment"; }`;
				}
			},
		},
		cloudflare({
			inspectorPort: false,
			persistState: false,
			viteEnvironment: {
				childEnvironments: ["child"],
			},
		}),
	],
});
