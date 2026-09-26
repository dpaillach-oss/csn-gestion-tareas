/* ==========================================================================
   xlsx.js – Generador de planillas Excel (.xlsx) reales, sin dependencias
   Construye el paquete OpenXML y lo comprime con CSN.zip.
   API:
     CSN.xlsx.crear({ titulo, empresa, hojas:[{ nombre, columnas, filas, totales }] })
     -> Promise<Blob>  (application/vnd.openxmlformats-officedocument.spreadsheetml.sheet)
   ========================================================================== */
(function (global) {
  'use strict';
  var CSN = global.CSN = global.CSN || {};
  var U = CSN.util;

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/\r/g, '');
  }
  function col(n) { // 0 -> A
    var s = '';
    n += 1;
    while (n > 0) { var r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
    return s;
  }
  function utf8(str) {
    if (global.TextEncoder) return new global.TextEncoder().encode(str);
    return new Uint8Array(Buffer.from(str, 'utf8'));
  }

  /* --- Estilos (índices de cellXfs usados por las celdas) --- */
  var S_DEF = 0, S_HEAD = 1, S_TXT = 2, S_NUM = 3, S_TITLE = 4, S_SUB = 5, S_TOT = 6, S_NUMB = 7;
  var AZUL = 'FF003090', AZUL_CLARO = 'FFE8EEF9', GRIS = 'FFC9D2E2', VERDE = 'FF60CC24';

  function stylesXml() {
    var F = [
      '<font><sz val="11"/><color theme="1"/><name val="Calibri"/></font>',                       // 0
      '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>',               // 1
      '<font><b/><sz val="14"/><color rgb="' + AZUL + '"/><name val="Calibri"/></font>',           // 2
      '<font><i/><sz val="10"/><color rgb="FF55637C"/><name val="Calibri"/></font>',               // 3
      '<font><b/><sz val="11"/><color rgb="FF12203A"/><name val="Calibri"/></font>'                // 4
    ];
    var FILLS = [
      '<fill><patternFill patternType="none"/></fill>',
      '<fill><patternFill patternType="gray125"/></fill>',
      '<fill><patternFill patternType="solid"><fgColor rgb="' + AZUL + '"/><bgColor indexed="64"/></patternFill></fill>',       // 2
      '<fill><patternFill patternType="solid"><fgColor rgb="' + AZUL_CLARO + '"/><bgColor indexed="64"/></patternFill></fill>', // 3
      '<fill><patternFill patternType="solid"><fgColor rgb="FFEEF8E5"/><bgColor indexed="64"/></patternFill></fill>'            // 4
    ];
    var BORDES =
      '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>' +
      '<border><left style="thin"><color rgb="' + GRIS + '"/></left><right style="thin"><color rgb="' + GRIS + '"/></right>' +
      '<top style="thin"><color rgb="' + GRIS + '"/></top><bottom style="thin"><color rgb="' + GRIS + '"/></bottom><diagonal/></border></borders>';
    var XF = [
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>',
      '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>',
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>',
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="top"/></xf>',
      '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>',
      '<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>',
      '<xf numFmtId="0" fontId="4" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment vertical="center"/></xf>',
      '<xf numFmtId="0" fontId="4" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="top"/></xf>'
    ];
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<fonts count="' + F.length + '">' + F.join('') + '</fonts>' +
      '<fills count="' + FILLS.length + '">' + FILLS.join('') + '</fills>' +
      BORDES +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="' + XF.length + '">' + XF.join('') + '</cellXfs>' +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
      '</styleSheet>';
  }

  function hojaXml(hoja, titulo, empresa) {
    var columnas = hoja.columnas || [];
    var nCols = Math.max(1, columnas.length);
    var filas = hoja.filas || [];
    var xmlFila = [];
    var r = 1;

    // Encabezado del informe (título + empresa + fecha de emisión)
    if (titulo || empresa) {
      var t = (titulo || 'Informe') + (empresa ? ' — ' + empresa : '');
      xmlFila.push('<row r="1" ht="22" customHeight="1"><c r="A1" s="' + S_TITLE + '" t="inlineStr"><is><t xml:space="preserve">' + esc(t) + '</t></is></c></row>');
      r = 2;
    }
    if (hoja.subtitulo) {
      xmlFila.push('<row r="' + r + '" ht="16" customHeight="1"><c r="A' + r + '" s="' + S_SUB + '" t="inlineStr"><is><t xml:space="preserve">' + esc(hoja.subtitulo) + '</t></is></c></row>');
      r++;
    }

    var filaCab = r;
    xmlFila.push('<row r="' + filaCab + '" ht="28" customHeight="1">' + columnas.map(function (c, i) {
      return '<c r="' + col(i) + filaCab + '" s="' + S_HEAD + '" t="inlineStr"><is><t xml:space="preserve">' + esc(c.t || c) + '</t></is></c>';
    }).join('') + '</row>');
    r++;

    filas.forEach(function (fila) {
      var celdas = [];
      for (var i = 0; i < nCols; i++) {
        var v = fila[i];
        if (v === null || v === undefined || v === '') continue;
        var ref = col(i) + r;
        if (typeof v === 'number' && isFinite(v)) {
          celdas.push('<c r="' + ref + '" s="' + S_NUM + '"><v>' + v + '</v></c>');
        } else if (typeof v === 'boolean') {
          celdas.push('<c r="' + ref + '" s="' + S_TXT + '" t="inlineStr"><is><t>' + (v ? 'Sí' : 'No') + '</t></is></c>');
        } else {
          celdas.push('<c r="' + ref + '" s="' + S_TXT + '" t="inlineStr"><is><t xml:space="preserve">' + esc(v) + '</t></is></c>');
        }
      }
      xmlFila.push('<row r="' + r + '">' + celdas.join('') + '</row>');
      r++;
    });

    if (hoja.totales && hoja.totales.length) {
      var cs = [];
      for (var j = 0; j < nCols; j++) {
        var tv = hoja.totales[j];
        if (tv === null || tv === undefined || tv === '') continue;
        var refT = col(j) + r;
        if (typeof tv === 'number' && isFinite(tv)) cs.push('<c r="' + refT + '" s="' + S_NUMB + '"><v>' + tv + '</v></c>');
        else cs.push('<c r="' + refT + '" s="' + S_TOT + '" t="inlineStr"><is><t xml:space="preserve">' + esc(tv) + '</t></is></c>');
      }
      xmlFila.push('<row r="' + r + '">' + cs.join('') + '</row>');
    }

    var cols = columnas.map(function (c, i) {
      return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + (c.w || 16) + '" customWidth="1"/>';
    }).join('');

    var cabRow = hoja.subtitulo ? 2 : (titulo || empresa ? 1 : 0);
    var ultimaFila = (hoja.totales && hoja.totales.length) ? r : r - 1;
    var dimension = 'A1:' + col(nCols - 1) + Math.max(1, ultimaFila);

    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<dimension ref="' + dimension + '"/>' +
      '<sheetViews><sheetView workbookViewId="0"' + (hoja.activa ? ' tabSelected="1"' : '') + '>' +
      '<pane ySplit="' + filaCab + '" topLeftCell="A' + (filaCab + 1) + '" activePane="bottomLeft" state="frozen"/>' +
      '<selection pane="bottomLeft" activeCell="A' + (filaCab + 1) + '" sqref="A' + (filaCab + 1) + '"/>' +
      '</sheetView></sheetViews>' +
      '<sheetFormatPr defaultRowHeight="15"/>' +
      '<cols>' + cols + '</cols>' +
      '<sheetData>' + xmlFila.join('') + '</sheetData>' +
      '<autoFilter ref="A' + filaCab + ':' + col(nCols - 1) + Math.max(filaCab, ultimaFila) + '"/>' +
      '<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>' +
      '</worksheet>';
  }

  CSN.xlsx = {
    construir: function (opts) {
      opts = opts || {};
      var hojas = opts.hojas || [];
      if (!hojas.length) hojas = [{ nombre: 'Datos', columnas: [{ t: 'Sin datos', w: 20 }], filas: [] }];
      var fecha = new Date().toISOString().replace(/\.\d+Z$/, 'Z');

      var contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        hojas.map(function (h, i) {
          return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
        }).join('') +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
        '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
        '</Types>';

      var rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
        '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>' +
        '</Relationships>';

      var workbook = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        '<workbookPr/><sheets>' +
        hojas.map(function (h, i) {
          return '<sheet name="' + esc((h.nombre || ('Hoja' + (i + 1))).slice(0, 31)) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>';
        }).join('') +
        '</sheets></workbook>';

      var wbRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        hojas.map(function (h, i) {
          return '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>';
        }).join('') +
        '<Relationship Id="rId' + (hojas.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
        '</Relationships>';

      var core = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
        '<dc:title>' + esc(opts.titulo || 'Informe') + '</dc:title>' +
        '<dc:creator>' + esc(opts.empresa || 'CSN Gestión de Activos Inmobiliarios SPA') + '</dc:creator>' +
        '<cp:lastModifiedBy>' + esc(opts.empresa || 'CSN') + '</cp:lastModifiedBy>' +
        '<dcterms:created xsi:type="dcterms:W3CDTF">' + fecha + '</dcterms:created>' +
        '<dcterms:modified xsi:type="dcterms:W3CDTF">' + fecha + '</dcterms:modified>' +
        '</cp:coreProperties>';

      var app = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">' +
        '<Application>Gestión de Tareas CSN</Application><Company>' + esc(opts.empresa || 'CSN') + '</Company>' +
        '</Properties>';

      var archivos = [
        { nombre: '[Content_Types].xml', datos: utf8(contentTypes) },
        { nombre: '_rels/.rels', datos: utf8(rels) },
        { nombre: 'docProps/core.xml', datos: utf8(core) },
        { nombre: 'docProps/app.xml', datos: utf8(app) },
        { nombre: 'xl/workbook.xml', datos: utf8(workbook) },
        { nombre: 'xl/_rels/workbook.xml.rels', datos: utf8(wbRels) },
        { nombre: 'xl/styles.xml', datos: utf8(stylesXml()) }
      ];
      hojas.forEach(function (h, i) {
        if (i === 0) h.activa = true;
        archivos.push({
          nombre: 'xl/worksheets/sheet' + (i + 1) + '.xml',
          datos: utf8(hojaXml(h, opts.titulo, opts.empresa))
        });
      });

      return CSN.zip.crear(archivos).then(function (u8) {
        return new Blob([u8], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      });
    },

    /** Atajo: descarga directa */
    descargar: function (opts, nombreArchivo) {
      return CSN.xlsx.construir(opts).then(function (blob) {
        U.descargar(blob, nombreArchivo || ('informe-' + U.hoy() + '.xlsx'),
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        return blob;
      });
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
