// Navbar scroll effect
const navbar = document.getElementById('navbar');
window.addEventListener('scroll', () => {
  if (window.scrollY > 30) navbar.classList.add('scrolled');
  else navbar.classList.remove('scrolled');
});

// Mobile menu
const menuToggle = document.getElementById('menuToggle');
const mobileMenu = document.getElementById('mobileMenu');
menuToggle.addEventListener('click', () => {
  mobileMenu.classList.toggle('open');
});
mobileMenu.querySelectorAll('a').forEach(a => {
  a.addEventListener('click', () => mobileMenu.classList.remove('open'));
});

// Reveal on scroll
const revealElements = document.querySelectorAll('.reveal');
const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
      }
    });
  },
  { threshold: 0.1, rootMargin: '0px 0px -60px 0px' }
);
revealElements.forEach(el => observer.observe(el));

// FAQ accordion
document.querySelectorAll('.faq-question').forEach(button => {
  button.addEventListener('click', () => {
    const item = button.parentElement;
    const wasOpen = item.classList.contains('open');
    document.querySelectorAll('.faq-item').forEach(i => i.classList.remove('open'));
    if (!wasOpen) item.classList.add('open');
  });
});

// Open first FAQ by default
const firstFaq = document.querySelector('.faq-item');
if (firstFaq) firstFaq.classList.add('open');

// Smooth scroll for anchor links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function (e) {
    const href = this.getAttribute('href');
    if (href === '#') return;
    const target = document.querySelector(href);
    if (target) {
      e.preventDefault();
      const offset = 80;
      const targetPosition = target.getBoundingClientRect().top + window.pageYOffset - offset;
      window.scrollTo({ top: targetPosition, behavior: 'smooth' });
    }
  });
});

/* ============================================================
   ORÇAMENTO DINÂMICO
   ——————————————————————————————————————————————————————————
   FLUXO DE DADOS:
     1. Ao carregar, verifica cache localStorage (TTL: 1h).
     2. Se SHEET_ID configurado: busca GViz JSON do Google
        Sheets (sem chave de API — planilha pública).
     3. Analisa a resposta, monta mapa { 'A-2': valor, ... }.
     4. Ao usuário selecionar categoria + qtd, exibe preço
        com animação de contador e habilita botão WhatsApp.
     5. Botão monta URL wa.me/{PHONE}?text=... com mensagem
        pré-preenchida (nome, categoria, qtd, itens, valor).

   CONFIGURAÇÃO RÁPIDA:
     ① Abra este arquivo e preencha as constantes abaixo.
     ② Configure os preços fixos em PRECOS (fallback sempre
        ativo mesmo sem Sheets).
     ③ Opcionalmente conecte ao Google Sheets — ver passo a
        passo comentado em SHEET_ID.
   ============================================================ */

(function () {
  'use strict';

  /* ──────────────────────────────────────────────────────
     ① WHATSAPP_PHONE
        Formato: DDI + DDD + número, sem +, espaços ou traços.
        Exemplo: '5531999998888'  →  +55 (31) 99999-8888

        ⚠  O wa.me/message/... NÃO suporta texto pré-preenchido.
           Com o número correto aqui, a mensagem completa é
           enviada automaticamente. Sem ele, abre o link genérico.
  ────────────────────────────────────────────────────── */
  var WHATSAPP_PHONE = '553197157223';   // ← ex: '5531999998888'

  /* ──────────────────────────────────────────────────────
     ② PRECOS — valores de fallback (e modo sem Sheets)
        Preencha com os valores em centavos ou reais (Number).
        Exemplo: 'A-2': 350  →  R$ 350,00
        Deixe 0 para exibir "Consulte-nos".
  ────────────────────────────────────────────────────── */
  var PRECOS = {
    'A-2':  390.00,    // ← Categoria A · 2 aulas   (ex: 350)
    'A-5':  565.00,    // ← Categoria A · 5 aulas   (ex: 800)
    'A-10': 830.00,    // ← Categoria A · 10 aulas  (ex: 1400)
    'B-2':  430.00,    // ← Categoria B · 2 aulas   (ex: 400)
    'B-5':  665.00,    // ← Categoria B · 5 aulas   (ex: 900)
    'B-10': 1030.00,    // ← Categoria B · 10 aulas  (ex: 1600)
    'AB-2': 820.00,    // ← Categoria AB · 2 aulas   (ex: 410)
    'AB-5': 1230.00,    // ← Categoria AB · 5 aulas   (ex: 620)
    'AB-10': 1860.00,    // ← Categoria AB · 10 aulas  (ex: 900)
  };

  /* ──────────────────────────────────────────────────────
     ③ SHEET_ID — Google Sheets (opcional, preço dinâmico)

        Como configurar:
        a) Crie uma planilha em sheets.google.com
        b) Crie uma aba chamada "Precos" com as colunas:
              Categoria | Qtd_Aulas | Preco
           Dados:
              A  | 2  | 350
              A  | 5  | 800
              A  | 10 | 1400
              B  | 2  | 400
              B  | 5  | 900
              B  | 10 | 1600
        c) Compartilhar → "Qualquer pessoa com o link" → Leitor
        d) Copie o ID da URL (entre /d/ e /edit) e cole aqui.
           URL exemplo:
           docs.google.com/spreadsheets/d/[→ ESTE TRECHO ←]/edit
        e) Deixe '' para usar apenas os preços fixos acima.

        Alternativa low-code (Make/Zapier/Apps Script):
        → Crie um Google Apps Script que retorne os preços
          como JSON e substitua a URL em loadFromSheets().
  ────────────────────────────────────────────────────── */
  var SHEET_ID  = '';          // ← ex: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms'
  var CACHE_KEY = 'cfc_precos_v1';
  var CACHE_TTL = 60 * 60 * 1000;   // 1 hora em ms

  /* ── Estado interno ─────────────────────────────── */
  var prices = Object.assign({}, PRECOS);

  /* ── Atalho getElementById ──────────────────────── */
  function el(id) { return document.getElementById(id); }

  /* ── Inicialização ──────────────────────────────── */
  function init() {
    if (!el('orcNome')) return;          // seção não está no DOM
    if (SHEET_ID) { loadFromSheets(); } // busca dinâmica
    bindEvents();
    updateResult();
  }

  /* ── Carrega preços do Google Sheets ────────────── */
  function loadFromSheets() {
    var cached = getCache();
    if (cached) { prices = cached; updateResult(); return; }

    /* Endpoint GViz — sem API key (planilha pública) */
    var url = 'https://docs.google.com/spreadsheets/d/' + SHEET_ID
            + '/gviz/tq?tqx=out:json&sheet=Precos&headers=1';

    showLoading(true);

    fetch(url)
      .then(function (r) { return r.text(); })
      .then(function (text) {
        /* Remove wrapper JSONP: google.visualization.Query.setResponse({…}); */
        var json = text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1);
        var data = JSON.parse(json);
        var parsed = {};
        (data.table && data.table.rows || []).forEach(function (row) {
          var cat   = String((row.c[0] && row.c[0].v) || '').trim().toUpperCase();
          var qty   = parseInt((row.c[1]  && row.c[1].v)  || 0);
          var preco = parseFloat((row.c[2] && row.c[2].v) || 0);
          if (cat && qty && !isNaN(preco)) parsed[cat + '-' + qty] = preco;
        });
        /* Mescla: Sheets tem prioridade, PRECOS é fallback */
        prices = Object.assign({}, PRECOS, parsed);
        setCache(prices);
        showLoading(false);
        updateResult();
      })
      .catch(function (err) {
        console.warn('[CFC Orçamento] Sheets indisponível — usando preços fixos.', err);
        showLoading(false);
      });
  }

  /* ── Cache localStorage ─────────────────────────── */
  function getCache() {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      var obj = JSON.parse(raw);
      if (Date.now() - obj.ts > CACHE_TTL) {
        localStorage.removeItem(CACHE_KEY);
        return null;
      }
      return obj.data;
    } catch (e) { return null; }
  }

  function setCache(data) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ data: data, ts: Date.now() }));
    } catch (e) { /* quota exceeded — ignora */ }
  }

  /* ── Bind de eventos ────────────────────────────── */
  function bindEvents() {
    document.querySelectorAll('input[name="categoria"], input[name="quantidade"]')
      .forEach(function (inp) { inp.addEventListener('change', updateResult); });
  }

  /* ── Atualiza painel de resultado ───────────────── */
  function updateResult() {
    var catEl = document.querySelector('input[name="categoria"]:checked');
    var qtyEl = document.querySelector('input[name="quantidade"]:checked');
    var placeholder = el('resultPlaceholder');
    var card        = el('resultCard');
    if (!placeholder || !card) return;

    if (!catEl || !qtyEl) {
      placeholder.style.display = 'flex';
      card.style.display = 'none';
      return;
    }

    var cat   = catEl.value;
    var qty   = parseInt(qtyEl.value);
    var key   = cat + '-' + qty;
    var preco = prices[key];

    placeholder.style.display = 'none';
    card.style.display = 'flex';

    /* Badge de categoria */
    var badge = el('resultBadge');
    if (badge) badge.textContent = cat === 'A'
      ? '🏍️ Categoria A — Motocicleta'
      : cat === 'B'
      ? '🚗 Categoria B — Automóvel'
      : '🏍️ - 🚗 Categoria AB — Motocicleta e Automóvel';

    /* Quantidade de aulas */
    var aulasEl = el('resultAulas');
    if (aulasEl) {
      if (cat === 'AB') {
        aulasEl.textContent = qty + ' de moto + ' + qty + ' de carro';
      } else {
        aulasEl.textContent = qty + ' aula' + (qty > 1 ? 's' : '') + ' prática' + (qty > 1 ? 's' : '');
      }
    }

    /* Preço com animação */
    var precoEl = el('resultPreco');
    if (precoEl) {
      if (preco && preco > 0) {
        animatePrice(precoEl, preco);
      } else {
        precoEl.textContent = 'Consulte-nos';
        precoEl.dataset.current = '0';
      }
    }

    /* Habilita botão WhatsApp */
    var waBtn = el('waBtn');
    if (waBtn) {
      waBtn.disabled = false;
      waBtn.onclick  = function () { sendWhatsApp(cat, qty, preco); };
    }
  }

  /* ── Animação de contador no preço ─────────────── */
  function animatePrice(elem, target) {
    var duration = 520;
    var startTime = Date.now();
    var from = parseFloat(elem.dataset.current || '0');
    elem.dataset.current = target;

    (function tick() {
      var elapsed  = Date.now() - startTime;
      var progress = Math.min(elapsed / duration, 1);
      var eased    = 1 - Math.pow(1 - progress, 3); // ease-out cúbico
      var current  = from + (target - from) * eased;
      elem.textContent = current.toLocaleString('pt-BR', {
        style: 'currency', currency: 'BRL'
      });
      if (progress < 1) requestAnimationFrame(tick);
    })();
  }

  /* ── Construtor da URL e envio ao WhatsApp ───────
   *
   *  Mensagem gerada (pré-preenchida na conversa):
   *
   *    Olá! Vim pelo site e gostaria de confirmar um orçamento.
   *
   *    👤 Nome: Maria Silva
   *    🏷️ Categoria: B (Automóvel)
   *    📚 Aulas Práticas: 5 aulas
   *    ✅ Incluso: Aluguel do Veículo + Certificado
   *    💰 Valor do Pacote: R$ 900,00
   *
   *    Pode confirmar disponibilidade e condições de pagamento?
   *
   *  URL: wa.me/{PHONE}?text={encodedMsg}
   * ──────────────────────────────────────────────── */
  function sendWhatsApp(cat, qty, preco) {
    var nome = (el('orcNome') && el('orcNome').value.trim()) || 'Não informado';

    /* catLabel e aulasDescr diferenciados por categoria */
    var catLabel, aulasDescr;
    if (cat === 'AB') {
      catLabel   = 'AB (Moto + Carro)';
      aulasDescr = qty + ' de moto + ' + qty + ' de carro';
    } else {
      catLabel   = cat === 'A' ? 'A (Motocicleta)' : 'B (Automóvel)';
      aulasDescr = qty + ' aula' + (qty > 1 ? 's' : '') + ' prática' + (qty > 1 ? 's' : '');
    }

    var precoStr = (preco && preco > 0)
      ? preco.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
      : 'A consultar';

    /* Emojis construídos via String.fromCharCode (surrogate pairs) —
     * fonte 100% ASCII, imune a charset incorreto no servidor.
     * fromCP(n): converte code point suplementar (> U+FFFF) em surrogate pair. */
    function fromCP(n) {
      var x = n - 0x10000;
      return String.fromCharCode(0xD800 + (x >> 10), 0xDC00 + (x & 0x3FF));
    }
    var linhas = [
      'Olá! Vim pelo site e gostaria de confirmar um orçamento.',
      '',
      '*Nome:* ' + nome,
      '*Categoria:* ' + catLabel,
      '*Aulas Práticas:* ' + aulasDescr,
      '*Incluso:* Aluguel do Veículo + Certificado',
      '*Valor do Pacote:* ' + precoStr,
      '',
      'Pode confirmar disponibilidade e condições de pagamento? Obrigado(a)!',
    ];
    var msg = linhas.join('\n');

    var phone   = WHATSAPP_PHONE.replace(/\D/g, '');
    var isValid = phone.length >= 10 && !/[xX]/.test(WHATSAPP_PHONE);

    var url = isValid
      ? 'https://wa.me/' + phone + '?text=' + encodeURIComponent(msg)
      : 'https://wa.me/message/A3NLXVATGXRLJ1';

    window.open(url, '_blank', 'noopener,noreferrer');
  }

  /* ── Estado de loading ──────────────────────────── */
  function showLoading(show) {
    var loading = el('resultLoading');
    if (loading) loading.style.display = show ? 'flex' : 'none';
  }

  /* ── Inicia ─────────────────────────────────────── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();