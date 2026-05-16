// Declaration for pdf-parse inner module path.
// @types/pdf-parse only covers the root "pdf-parse" path, but we import
// "pdf-parse/lib/pdf-parse.js" to skip the buggy test snippet in index.js.
declare module "pdf-parse/lib/pdf-parse.js" {
  interface PdfParseResult {
    text: string;
    numpages: number;
    numrender: number;
    info: any;
    metadata: any;
    version: string;
  }
  function pdfParse(buf: Buffer): Promise<PdfParseResult>;
  export default pdfParse;
}
