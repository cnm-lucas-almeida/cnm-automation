import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// pdfjs-dist detecta que está em Node (sem Worker real de browser) e cai no modo "fake worker":
// importa dinamicamente "./pdf.worker.mjs" relativo ao próprio módulo pdf.mjs (ver
// PDFWorker._setupFakeWorkerGlobal em node_modules/pdfjs-dist/legacy/build/pdf.mjs). Isso
// funciona rodando direto no node_modules, mas depois que o Next empacota o import num chunk em
// .next/server/chunks/, esse caminho relativo passa a ser resolvido dentro de chunks/ — onde o
// worker não existe — e o build quebra em produção com "Setting up fake worker failed: Cannot
// find module '.../chunks/pdf.worker.mjs'". Apontar GlobalWorkerOptions.workerSrc pro arquivo
// real dentro de node_modules resolve, porque o Dockerfile não usa output "standalone" (faz
// `npm ci` completo e copia node_modules inteiro pro container, então o caminho abaixo existe
// em runtime).
// O import dinâmico dentro do pdfjs-dist exige uma URL com scheme (file://) — um caminho
// absoluto puro (ex. "C:\..." ou até "/app/...") é rejeitado pelo loader ESM do Node com
// "Only URLs with a scheme in: file, data, and node are supported".
pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(
  path.join(process.cwd(), 'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs')
).href;

export { pdfjsLib };
