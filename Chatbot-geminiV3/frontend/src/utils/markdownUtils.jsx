// src/utils/markdownUtils.js
import katex from 'katex';

const decodeHtmlEntities = (encodedString) => {
  if (typeof encodedString !== 'string') return encodedString;
  return encodedString
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/'/g, "'");
};

export const renderMathInHtml = (htmlString) => {
  if (!htmlString || typeof htmlString !== 'string') return htmlString;
  console.log("[Math Test] renderMathInHtml: INPUT HTML:\n", htmlString);

  let processedString = htmlString;

  processedString = processedString.replace(/\$\$([\s\S]+?)\$\$/g, (match, rawExpression) => {
    const expression = decodeHtmlEntities(rawExpression.trim());
    console.log("[Math Test] renderMathInHtml: DISPLAY math to KaTeX:", expression);
    try {
      const rendered = katex.renderToString(expression, { displayMode: true, throwOnError: false, macros: {"\\RR": "\\mathbb{R}"}});
      console.log("[Math Test] renderMathInHtml: KaTeX DISPLAY output:", rendered);
      return rendered;
    } catch (e) { console.warn(`[Math Test] KaTeX display error: ${e.message} for: ${expression}`); return match; }
  });

  processedString = processedString.replace(/(^|[^\$])\$([^\$\n]+?)\$([^\$]|$)/g, (fullMatch, prefix, rawExpression, suffix) => {
    const expression = decodeHtmlEntities(rawExpression.trim());
    if (!expression) return fullMatch;
    console.log("[Math Test] renderMathInHtml: INLINE math to KaTeX:", expression);
    try {
      const rendered = katex.renderToString(expression, { displayMode: false, throwOnError: false, macros: {"\\RR": "\\mathbb{R}"}});
      console.log("[Math Test] renderMathInHtml: KaTeX INLINE output:", rendered);
      return prefix + rendered + suffix;
    } catch (e) { console.warn(`[Math Test] KaTeX inline error: ${e.message} for: ${expression}`); return fullMatch; }
  });

  console.log("[Math Test] renderMathInHtml: FINAL PROCESSED HTML:\n", processedString);
  return processedString;
};