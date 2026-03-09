import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { extractMissingFiles } = require("./latexDependencies.js") as {
  extractMissingFiles: (logText: string) => string[];
};

describe("extractMissingFiles", () => {
  it("detects graphicx-style missing image errors", () => {
    const log = `
! Package pdftex.def Error: File \`images/v_j_single_machine.png' not found: using draft setting.

See the pdftex.def package documentation for explanation.
`;

    expect(extractMissingFiles(log)).toEqual(["images/v_j_single_machine.png"]);
  });

  it("collects distinct missing files from warnings and errors", () => {
    const log = `
LaTeX Warning: File 'images/figure-a.png' not found on input line 42.
! LaTeX Error: File \`sections/intro.tex' not found.
Package graphics Warning: File 'images/figure-a.png' not found.
`;

    expect(extractMissingFiles(log)).toEqual([
      "images/figure-a.png",
      "sections/intro.tex",
    ]);
  });
});
