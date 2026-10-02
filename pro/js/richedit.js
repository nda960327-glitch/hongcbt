// 보이는 그대로 쓰는 편집기 — 글쓰기 textarea 위에 얹는다.
//  저장 형식(본문 표기: '## ' 소제목 · '# ' 큰 글씨 · **굵게** · {색|글} · '- ' 목록 · [img:0] 사진)은 그대로다.
//  편집기에서 글이 바뀔 때마다 표기로 바꿔 원래 textarea 에 넣고 input 이벤트를 낸다 — 임시저장·미리보기·저장 코드는 textarea 만 보면 된다.
//  상담소 콘솔(doc)과 상담사 앱(pro)이 같은 파일을 쓴다 — 고치면 두 곳 모두 고친다.
(function () {
  const COL = { green: '#2f7d4f', blue: '#2d64a8', red: '#c9463d', orange: '#d97a1c', purple: '#7a4fb0', gray: '#7f7264' };
  const INK = '#2f2923';
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const rgbOf = h => 'rgb(' + parseInt(h.slice(1, 3), 16) + ',' + parseInt(h.slice(3, 5), 16) + ',' + parseInt(h.slice(5, 7), 16) + ')';
  // 색 값 → 이름. 모르는 색(검정으로 되돌린 것 포함)은 '-' — 바깥 색을 끊는다.
  function colName(v) {
    v = String(v || '').toLowerCase().replace(/\s+/g, '');
    if (!v) return '';
    for (const k in COL) if (v === COL[k] || v === rgbOf(COL[k])) return k;
    return '-';
  }

  let cssDone = false;
  function css() {
    if (cssDone) return; cssDone = true;
    const st = document.createElement('style');
    st.textContent = '.rich{position:relative;min-height:16rem;max-height:62vh;overflow-y:auto;border:1.5px solid rgba(120,96,66,.2);border-radius:12px;padding:.7rem .9rem;background:#fff;color:#2f2923;line-height:1.7;font-size:.95rem;outline:none;overflow-wrap:anywhere;cursor:text}'
      + '.rich:focus{border-color:#4f8a6b}.rich.empty::before{content:attr(data-ph);position:absolute;left:.9rem;right:.9rem;top:.7rem;color:#a89c8c;pointer-events:none}'
      + '.rich p{margin:0}.rich h2{font-size:1.15rem;font-weight:800;margin:.7rem 0 .3rem;padding-left:.6rem;border-left:4px solid #4f8a6b}.rich h3{font-size:1.12rem;font-weight:700;margin:.2rem 0}'
      + '.rich ul{margin:.2rem 0;padding-left:1.3rem}.rich img.rimg{display:block;max-width:min(100%,320px);border-radius:10px;margin:.3rem 0}'
      + '.rich .c-green{color:#2f7d4f}.rich .c-blue{color:#2d64a8}.rich .c-red{color:#c9463d}.rich .c-orange{color:#d97a1c}.rich .c-purple{color:#7a4fb0}.rich .c-gray{color:#7f7264}';
    document.head.appendChild(st);
  }

  function make(ta, opt) {
    css();
    opt = opt || {};
    const imgSrc = n => (opt.img ? opt.img(n) : '') || '';
    const ED = document.createElement('div');
    ED.className = 'rich'; ED.contentEditable = 'true';
    ED.setAttribute('role', 'textbox'); ED.setAttribute('aria-multiline', 'true'); ED.setAttribute('aria-label', '본문');
    ED.setAttribute('data-ph', opt.placeholder || '여기에 글을 써 주세요. 글자를 고른 뒤 위 버튼을 누르면 바로 꾸며져요.');
    ta.hidden = true; ta.style.display = 'none';
    ta.parentNode.insertBefore(ED, ta.nextSibling);

    const inH = x => esc(x)
      .replace(/\{(red|orange|green|blue|purple|gray)\|([^{}]*)\}/g, '<span class="c-$1">$2</span>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    const imgTag = n => { const s = imgSrc(n); return s ? '<img class="rimg" data-img="' + n + '" src="' + esc(s) + '" alt="사진 ' + (n + 1) + '">' : ''; };
    function toH(text) {
      let h = '', prevP = false;
      String(text || '').split(/\n{2,}/).forEach(b => {
        const s = b.replace(/\s+$/, ''); if (!s.trim()) return;
        let isP = false, x;
        const im = s.trim().match(/^\[img:(\d+)\]$/);
        if (im && imgTag(+im[1])) x = '<p>' + imgTag(+im[1]) + '</p>';
        else if (/^## /.test(s)) x = '<h2>' + inH(s.slice(3)) + '</h2>';
        else if (/^# /.test(s)) x = '<h3>' + inH(s.slice(2)) + '</h3>';
        else if (s.split('\n').every(l => /^- /.test(l))) x = '<ul>' + s.split('\n').map(l => '<li>' + (inH(l.slice(2)) || '<br>') + '</li>').join('') + '</ul>';
        else { isP = true; x = s.split('\n').map(l => '<p>' + (inH(l) || '<br>') + '</p>').join(''); }
        if (isP && prevP) h += '<p><br></p>';
        h += x; prevP = isP;
      });
      return h;
    }
    // 글자마다 굵기·색을 따져 납작하게 적는다 — 색 안에 색이 겹쳐도 표기는 한 겹만 나오게
    function styOf(n, nob) {
      let c = '', b = false;
      for (let e = n.parentNode; e && e !== ED; e = e.parentNode) {
        if (e.nodeType !== 1) continue;
        if (e.tagName === 'B' || e.tagName === 'STRONG' || (e.style && /^(bold|[6-9]00)$/.test(e.style.fontWeight))) b = true;
        if (!c) { const m = String(e.className || '').match(/c-(red|orange|green|blue|purple|gray)/); c = m ? m[1] : colName(e.getAttribute('color') || (e.style && e.style.color)); }
      }
      return { c: c === '-' ? '' : c, b: nob ? false : b };
    }
    function inl(nodes, nob) {
      const runs = [];
      const add = (t, s) => { const l = runs[runs.length - 1]; if (l && !l.raw && l.c === s.c && l.b === s.b && l.t !== '\n') l.t += t; else runs.push({ t, c: s.c, b: s.b }); };
      (function walkAll(list) {
        list.forEach(function walk(n) {
          if (n.nodeType === 3) { const t = n.nodeValue.replace(/ /g, ' ').replace(/[\r\n]+/g, ' '); if (t) add(t, styOf(n, nob)); return; }
          if (n.nodeType !== 1) return;
          if (n.tagName === 'BR') { runs.push({ t: '\n' }); return; }
          if (n.tagName === 'IMG') { const i = n.getAttribute('data-img'); if (i != null) runs.push({ t: '[img:' + i + ']', raw: 1 }); return; }
          if (/^(DIV|P|LI)$/.test(n.tagName) && runs.length && runs[runs.length - 1].t !== '\n') runs.push({ t: '\n' });
          [].forEach.call(n.childNodes, walk);
        });
      })(nodes);
      return runs.map(r => {
        if (r.t === '\n' || r.raw || !r.t.trim()) return r.t;
        const m = r.t.match(/^(\s*)([\s\S]*?)(\s*)$/); let s = m[2];
        if (r.b && s.indexOf('*') < 0) s = '**' + s + '**';
        if (r.c && !/[{}]/.test(s)) s = '{' + r.c + '|' + s + '}';
        return m[1] + s + m[3];
      }).join('').replace(/\n+$/, '');
    }
    function ser() {
      const out = []; let para = [], buf = [];
      const fb = () => { if (buf.length) { const t = inl(buf); buf = []; if (t.trim()) para.push(t); } };
      const flush = () => { fb(); if (para.length) { out.push(para.join('\n')); para = []; } };
      (function each(root) {
        [].forEach.call(root.childNodes, n => {
          const tn = n.nodeType === 1 ? n.tagName : '';
          if (tn === 'H2' || tn === 'H1') { flush(); const t = inl([n], true).replace(/\n/g, ' ').trim(); if (t) out.push('## ' + t); }
          else if (/^H[3-6]$/.test(tn)) { flush(); const t = inl([n], true).replace(/\n/g, ' ').trim(); if (t) out.push('# ' + t); }
          else if (tn === 'UL' || tn === 'OL') { flush(); const ls = []; [].forEach.call(n.querySelectorAll('li'), li => { const x = inl([li]).replace(/\n/g, ' ').trim(); if (x) ls.push('- ' + x); }); if (ls.length) out.push(ls.join('\n')); }
          else if (tn === 'P' || tn === 'DIV' || tn === 'BLOCKQUOTE') {
            fb();
            if (n.querySelector('p,div,h1,h2,h3,ul,ol')) each(n);
            else {
              const t = inl([n]);
              if (!t.trim()) flush();
              else if (/^\s*\[img:\d+\]\s*$/.test(t)) { flush(); out.push(t.trim()); }   // 사진은 늘 따로 선 문단
              else para.push(t);
            }
          } else buf.push(n);
        });
      })(ED);
      flush();
      return out.join('\n\n');
    }
    const ph = () => ED.classList.toggle('empty', !ED.textContent.trim() && !ED.querySelector('img,li,h2,h3'));
    function sync() { ta.value = ser(); ph(); ta.dispatchEvent(new Event('input', { bubbles: true })); }
    const inEd = () => { const s = window.getSelection(); return !!(s && s.rangeCount && ED.contains(s.anchorNode)); };
    function toEnd() {
      ED.focus(); if (inEd()) return;
      const r = document.createRange(); r.selectNodeContents(ED); r.collapse(false);
      const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
    }
    function curBlock() {
      const s = window.getSelection(); if (!s || !s.rangeCount) return null;
      for (let n = s.anchorNode; n && n !== ED; n = n.parentNode) if (n.nodeType === 1 && /^(P|DIV|H2|H3|LI)$/.test(n.tagName)) return n;
      return null;
    }
    function cmd(c, v) { toEnd(); try { document.execCommand('styleWithCSS', false, false); document.execCommand(c, false, v == null ? null : v); } catch (e) {} sync(); }

    try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch (e) {}
    ED.innerHTML = toH(ta.value); ph();
    ED.addEventListener('input', sync);
    ED.addEventListener('paste', e => { e.preventDefault(); const t = ((e.clipboardData || window.clipboardData).getData('text') || '').replace(/\r/g, ''); if (t) document.execCommand('insertText', false, t); sync(); });
    ED.addEventListener('drop', e => e.preventDefault());

    const api = {
      el: ED,
      // textarea 값을 밖에서 바꿨을 때(글감 넣기·사진 빼기) 편집기를 다시 그린다
      refresh() { ED.innerHTML = toH(ta.value); ph(); },
      focus() { toEnd(); },
      // 옛 도구 버튼의 표기를 그대로 받아 편집기 동작으로 바꾼다
      wrap(open) {
        if (open === '**') return cmd('bold');
        const m = String(open).match(/^\{(\w+)\|$/); if (!m || !COL[m[1]]) return;
        toEnd(); let cur = ''; try { cur = colName(document.queryCommandValue('foreColor')); } catch (e) {}
        cmd('foreColor', cur === m[1] ? INK : COL[m[1]]);
      },
      line(prefix) {
        toEnd(); let cb = curBlock();
        if (prefix === '- ') { if (cb && /^H[23]$/.test(cb.tagName)) cmd('formatBlock', 'p'); return cmd('insertUnorderedList'); }
        const tag = prefix === '## ' ? 'h2' : 'h3';
        if (cb && cb.tagName === 'LI') { cmd('insertUnorderedList'); cb = curBlock(); }
        cmd('formatBlock', cb && cb.tagName === tag.toUpperCase() ? 'p' : tag);
      },
      // 사진 — 커서가 있는 문단 뒤에 따로 선 문단으로 넣는다
      image(n) {
        const tag = imgTag(n); if (!tag) return;
        toEnd(); const cb = curBlock();
        const p = document.createElement('p'); p.innerHTML = tag;
        const after = document.createElement('p'); after.innerHTML = '<br>';
        let anchor = cb; while (anchor && anchor.parentNode !== ED) anchor = anchor.parentNode;
        if (anchor) { ED.insertBefore(p, anchor.nextSibling); } else ED.appendChild(p);
        ED.insertBefore(after, p.nextSibling);
        const r = document.createRange(); r.setStart(after, 0); r.collapse(true);
        const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
        sync();
      }
    };
    ta._rich = api;
    return api;
  }

  window.RichEdit = {
    mount(ta, opt) { if (!ta) return null; if (ta._rich && ta._rich.el.isConnected) return ta._rich; return make(ta, opt); },
    of(ta) { return ta && ta._rich && ta._rich.el.isConnected ? ta._rich : null; }
  };
})();
