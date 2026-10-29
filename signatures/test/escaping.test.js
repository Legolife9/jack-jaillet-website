// Checks the code that decides what HTML ends up in people's email signatures.
// It loads the real functions out of js/app.js, so it tests what ships. Run: node signatures/test/escaping.test.js
const fs = require('fs'), path = require('path'), assert = require('assert');
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8').replace(/\r\n/g, '\n');

// a top-level "function name(" runs to its matching brace; a "const name =" runs to the first line ending in ";"
function grab(name){
  let i = src.search(new RegExp(`^function ${name}\\(`, 'm'));
  if (i >= 0){
    let d = 0, j = src.indexOf('{', i);
    for (; j < src.length; j++){ if (src[j] === '{') d++; else if (src[j] === '}' && !--d) break; }
    return src.slice(i, j + 1);
  }
  i = src.search(new RegExp(`^const ${name} =`, 'm'));
  assert(i >= 0, `${name} not found in app.js`);
  return src.slice(i, src.indexOf(';\n', i) + 1);
}
const { esc, href, rich, resolveColors } = new Function(
  ['esc', 'href', 'rich', 'isTok', 'FONTS', 'STYLE0', 'FREE', 'resolveColors'].map(grab).join('\n') + '\nreturn { esc, href, rich, resolveColors };')();

// esc: everything that could open a tag or close an attribute
assert.strictEqual(esc(`<a href="x" title='y'>&`), '&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;');

// href: only http(s), mailto, tel and sms links come out; anything else gets https:// in front
assert.strictEqual(href('javascript:alert(1)'), 'https://javascript:alert(1)');
assert.strictEqual(href('JaVaScRiPt:alert(1)'), 'https://JaVaScRiPt:alert(1)');
assert.strictEqual(href('data:text/html,<script>'), 'https://data:text/html,<script>');
assert.strictEqual(href('tel:(617) 675-3156'), 'tel:6176753156');
assert.strictEqual(href('jane@example.com'), 'mailto:jane@example.com');
assert.strictEqual(href('example.com'), 'https://example.com');

// rich: only **bold**, *italic* and [text](link) become markup
assert(!rich('<img src=x onerror=alert(1)>', '#000').includes('<img'), 'raw tags must be escaped');
assert.strictEqual(rich('**b** *i*', '#000'), '<strong>b</strong> <em>i</em>');
const link = rich('[x](javascript:alert(1))', '#000').match(/href="([^"]*)"/)[1];
assert(link.startsWith('https://'), 'a javascript: link must not survive');
const quoted = rich('[x](https://a.com/"onmouseover=alert(1))', '#000');
assert(quoted.match(/href="([^"]*)"/)[1].includes('onmouseover'), 'a quote in a link must stay inside the href value');

// resolveColors: settings lose characters that could break out of an attribute, free text keeps them
const st = resolveColors({
  style:{ palette:['#000" x="1'], color:'@0', font:'Arial"><img src=x>' },
  rows:[{ id:'r1', cols:[{ bg:'#fff" onmouseover="x', blocks:[{ id:'b"1', text:'Say "hi" <b>', html:'<b>ok</b>' }] }] }]
});
assert.strictEqual(st.style.color, '#000 x=1', 'brand tokens resolve to cleaned palette colors');
assert.strictEqual(st.style.font, 'Arialimg src=x');
assert.strictEqual(st.rows[0].cols[0].bg, '#fff onmouseover=x');
assert.strictEqual(st.rows[0].cols[0].blocks[0].id, 'b1');
assert.strictEqual(st.rows[0].cols[0].blocks[0].text, 'Say "hi" <b>', 'text is escaped later, where it is used');
assert.strictEqual(st.rows[0].cols[0].blocks[0].html, '<b>ok</b>', 'custom HTML is kept as HTML');

console.log('escaping: all checks passed');
