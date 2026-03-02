export const BUILD_INFO = {
  version: process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0",
  commit: process.env.NEXT_PUBLIC_COMMIT_HASH ?? "",
  repo: "https://github.com/sombochea/secops",
  get commitUrl() {
    return this.commit ? `${this.repo}/commit/${this.commit}` : "";
  },
  get versionLabel() {
    return `v${this.version}`;
  },
};
