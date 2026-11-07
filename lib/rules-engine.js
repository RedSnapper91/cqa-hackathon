// Offline, deterministic evaluator (RU / KZ / EN). Works without any API key and
// is used as the fallback when the LLM is unavailable. Every verdict carries
// evidence message indexes and, for missing actions, the checked range.

const R = (s, f = 'iu') => new RegExp(s, f);

const P = {
  greet: R(String.raw`(здравствуй|добр(ый|ое|ого)\s+(день|утр|вечер)|приветствую|привет|сәлеметсіз|сәлем|салем|қайырлы\s+(күн|таң|кеш)|(?<!\p{L})(hi|hello|hey)(?!\p{L})|good\s+(morning|afternoon|evening)|welcome)`),
  // case-sensitive on purpose: a capitalised word after "I'm / я / мен" is a name
  intro: R(String.raw`([Мм]еня зовут|[Мм]енің атым|[Mm]y name is|(?<!\p{L})[Ii]['’]m\s+\p{Lu}|(?<!\p{L})[Ii] am\s+\p{Lu}|[Tt]his is\s+\p{Lu}|(?<!\p{L})[Яя]\s+\p{Lu}\p{Ll}+|(?<!\p{L})[Ээ]то\s+\p{Lu}\p{Ll}+|(?<!\p{L})[Мм]ен\s+\p{Lu}\p{Ll}+|\p{Lu}\p{Ll}+(мын|мін|пын|пін|бын|бін)(?!\p{L})|\[Имя скрыто\])`, 'u'),
  kzLetters: /[әғқңөұүһі]/i,
  cyr: /[а-яё]/i,
  latin: /[a-z]/i,
  genericHelp: R(String.raw`(чем (могу|можем) помочь|с чем помочь|how can i help|what can i do for you|қалай көмектесе аламын|сізге қандай көмек)`),
  misunderstood: R(String.raw`(я писал выше|я же писал|i already (said|wrote|told)|жоғарыда жаздым|не то|я не об этом|я же (писал|сказал|спросил)|не понял|не поняла|не понятно|непонятно|вы не поняли|в смысле\?|i meant|that's not what|not what i asked|what do you mean|i don't understand|түсінбедім|түсініксіз|мен ол туралы емес)`),
  verifiedSys: R(String.raw`(личность клиента подтверждена|identity verified|жеке басы расталды)`),
  idRequest: R(String.raw`(идентификац|подтверд\S*\s+личност|подтвердим личность|verify\s+(your\s+)?identity|identity verification|confirm your identity|жеке бас\S*\s+раста|сәйкестендір|фамили\S*,?\s+им|ФИО|шестизначн\S* код|кодовое слово)`),
  protectedNeed: R(String.raw`(мо[йеиюя]\s+(сч[её]т|деньг|платеж|платёж|позици|портфел|вывод|перевод|заявк|поручени|баланс|средств|бумаг)|на мо[её]м сч[её]т|по моему сч[её]т|пропал|не пришл|не зачисл|списал|не вижу (бумаг|позици|деньг|средств)|сменить (номер|телефон|почт|паспорт)|изменить (номер|данные|паспорт)|my\s+(money|payment|position|portfolio|withdrawal|deposit|order|balance|transfer)|my account (is|was|has|got|shows|balance)|change (my|the) (phone|number|email|details)|менің\s+(шот|ақша|төлем)|шотыма|ақшам|төлемім|көрінбей)`),
  disclose: R(String.raw`(на вашем сч[её]те (сейчас|числится|находится|есть|видно)|ваш баланс|по вашему сч[её]ту (видно|вижу|отображается|числится)|ваш (платеж|платёж|перевод) (зачислен|поступил|прош[её]л)|your balance is|on your account (i see|there is|shows)|i can see (that )?your|сіздің шотыңызда)`),
  thanks: R(String.raw`(спасибо|благодар|нашл[аи]?|нашёл|нашел|получилось|понял|поняла|ясно|(?<!\p{L})ок(?!\p{L})|хорошо|разобрал|так и сделаю|thank|thanks|got it|found it|that works|it works|worked|perfect|great|makes sense|рақмет|рахмет|таптым|көрдім|түсіндім|түсінікті|жақсы|болды)`),
  confused: R(String.raw`(непонятно|вс[её] ещё не|все еще не|still (don't|not|confused)|не понимаю|как же тогда|түсініксіз|әлі түсінбедім)`),
  neg: R(String.raw`(беспоко|пережива|волну|возмущ|недовол|ужас|безобраз|сколько можно|опять|снова не|не работает|не могу|не получается|пропал|пропала|не приходит|не пришл|задерж|неудобн|раздраж|долго|потерял|frustrat|annoy|upset|worried|ridiculous|unacceptable|not working|doesn't work|can't|cannot|missing|disappeared|delay|inconvenien|ашу|алаңда|мазала|жұмыс істемейді|кешік|жоғалып|көрінбей|таба алмадым)`),
  empathy: R(String.raw`(понима|сожале|извин|прошу прощения|приносим|неприятн|беспоко|понятно,? что|ясно,? что|understand|sorry|apolog|frustrating|i see why|that must|түсінікті|түсінемін|кешіріңіз|өкінішті|алаңдайтын)`),
  rude: R(String.raw`(читать (вообще )?умеете|вы вообще (читать|понимаете)|can't you read|are you blind|оқи алмайсыз ба|дурак|идиот|туп(ой|ая|ые|ица)|сам(и)?\s+виноват|не мои проблемы|ваши проблемы|stupid|idiot|dumb|your problem|not my problem|ақымақ|өзіңіз кінәлісіз)`),
  wait: R(String.raw`(минут|секунд|подожд|ожида|момент|сейчас (посмотрю|проверю|уточню)|one moment|a moment|please wait|bear with|let me check|give me a|күте тұрыңыз|бір минут|қазір тексер)`),
  farewell: R(String.raw`(до свидания|всего доброго|всего хорошего|хорошего (дня|вечера|настроения|выходн)|удачи|до связи|goodbye|(?<!\p{L})bye(?!\p{L})|have a (good|nice|great|lovely)|take care|сау болыңыз|күніңіз сәтті|кешіңіз сәтті|қош|сәттілік)`),
  offer: R(String.raw`(обращайтесь|чем ещё|чем еще|если (останутся|возникнут|будут|появятся) вопрос|если вопрос останется|напишите нам|anything else|feel free|let us know|reach out|тағы сұрақ|хабарласыңыз|жазыңыз)`),
  abrupt: R(String.raw`(клиент покинул|соединение с клиентом прервано|connection to customer lost|customer left|left the chat|байланыс үзілді|чаттан шықты)`),
  closedByOp: R(String.raw`(оператор закрыл чат|agent closed the chat|оператор чатты жапты)`),
  personalMoney: R(String.raw`(на (мою )?карту|мне лично|мне на карт|переведите мне|скиньте .{0,25}мне|я сам (их )?вложу|через компанию (оформлять )?не надо|send (the )?money to me|transfer (it|the money)? ?to me|my (personal )?card|маған аудар|менің картам|жеке картама)`),
  privatePaid: R(String.raw`(личный номер|ваш номер.{0,40}(созвон|позвон)|частн\S* консультац|за плату|платн\S* консультац|personal number|private (advice|consultation)|i charge|for a fee|жеке нөмір|ақылы)`),
  confidential: R(String.raw`(у другого клиента|данные другого клиента|another client'?s|пароль от|ваш пароль|your password is|cvv)`),
  escalate: R(String.raw`(переда(м|ю|ла|л) (специалист|на проверку|вопрос)|специалисты (проверят|свяжутся)|escalat|i'll pass|forward(ed)? (this|it) to|маманға жібер|тексеруге жібер)`),
};

const LANG_NAME = { RU: 'русском', KZ: 'казахском', EN: 'английском' };

function q(line, max = 140) {
  const t = line.text.replace(/\s+/g, ' ');
  const ts = /T(\d{2}:\d{2}:\d{2})/.exec(line.timestamp)?.[1] || line.timestamp;
  return `«${t.length > max ? t.slice(0, max - 1) + '…' : t}» (#${line.idx}, ${ts})`;
}

function context(conv) {
  const lines = conv.transcript;
  const ops = lines.filter((l) => l.speaker === 'operator');
  const clients = lines.filter((l) => l.speaker === 'client');
  const sys = lines.filter((l) => l.speaker === 'system');
  const firstOp = ops[0] || null;
  const opRange = ops.length ? [ops[0].idx, ops[ops.length - 1].idx] : null;
  return { conv, lines, ops, clients, sys, firstOp, opRange, lang: conv.language };
}

function langMatches(text, lang) {
  if (lang === 'KZ') return P.kzLetters.test(text) || /сәлем|қайырлы/i.test(text);
  if (lang === 'RU') return P.cyr.test(text) && !/сәлеметсіз|қайырлы/i.test(text);
  if (lang === 'EN') return P.latin.test(text) && !P.cyr.test(text);
  return true;
}

const res = (answer, explanation, evidence = [], extra = {}) => ({
  answer,
  explanation,
  evidence: [...new Set(evidence.filter((x) => x !== undefined && x !== null))],
  checked_range: null,
  na_reason: null,
  confidence: 0.7,
  ...extra,
});

const detectors = {
  greeting(c, crit) {
    const { firstOp, lang } = c;
    if (!firstOp) return res('no', `${crit.title} — Нет. Оператор не подключился к диалогу.`, [], { checked_range: [0, c.lines.length - 1] });
    const g = P.greet.test(firstOp.text);
    const i = P.intro.test(firstOp.text);
    const l = langMatches(firstOp.text, lang);
    if (g && i && l) {
      return res('yes', `${crit.title} — Да. В первом ответе оператор поздоровался на ${LANG_NAME[lang] || 'языке клиента'} языке и представился. Основание — ${q(firstOp)}.`, [firstOp.idx], { confidence: 0.9 });
    }
    const miss = [!g && 'нет приветствия', !i && 'оператор не представился', !l && 'ответ не на языке клиента'].filter(Boolean).join(', ');
    return res('no', `${crit.title} — Нет: ${miss}. Проверен первый ответ оператора ${q(firstOp)}.`, [firstOp.idx], { checked_range: [firstOp.idx, firstOp.idx], confidence: 0.8 });
  },

  needs(c, crit) {
    const { ops, clients } = c;
    if (!ops.length) return res('na', `${crit.title} — N/A. Оператор не вступил в диалог.`, [], { na_reason: 'Оператор не вступил в диалог.' });
    const clarifying = ops.find((l) => l.text.includes('?') && !P.genericHelp.test(l.text));
    const confusedClient = clients.find((l) => l.idx > ops[0].idx && P.misunderstood.test(l.text));
    if (clarifying && !confusedClient) {
      return res('yes', `${crit.title} — Да. Оператор уточнил недостающие детали перед ответом. Основание — ${q(clarifying)}.`, [clarifying.idx], { confidence: 0.75 });
    }
    if (confusedClient) {
      return res('no', `${crit.title} — Нет. Оператор не уточнил запрос, клиенту пришлось поправлять: ${q(confusedClient)}.`, [confusedClient.idx], { checked_range: [ops[0].idx, confusedClient.idx], confidence: 0.65 });
    }
    const req = clients.find((l) => l.idx < ops[0].idx) || clients[0];
    const reason = 'Данных клиента хватало для ответа с самого начала — уточнения не потребовались.';
    return res('na', `${crit.title} — N/A. ${reason} Запрос: ${req ? q(req) : '—'}; ответ оператора: ${q(ops[0])}.`, [req?.idx, ops[0].idx], { na_reason: reason, confidence: 0.55 });
  },

  identification(c, crit) {
    const { ops, clients, sys, lines } = c;
    const verified = sys.find((l) => P.verifiedSys.test(l.text));
    const disclose = ops.find((l) => P.disclose.test(l.text));
    const idReq = ops.find((l) => P.idRequest.test(l.text));
    const need = clients.find((l) => P.protectedNeed.test(l.text));
    if (verified) {
      if (disclose && disclose.idx < verified.idx) {
        return res('no', `${crit.title} — Нет. Данные по счёту раскрыты до подтверждения личности: ${q(disclose)}; подтверждение пришло позже ${q(verified)}.`, [disclose.idx, verified.idx], { confidence: 0.8 });
      }
      return res('yes', `${crit.title} — Да. Личность подтверждена до раскрытия данных и защищённых действий. Основание — системное сообщение ${q(verified)}${idReq ? `, запрос оператора ${q(idReq)}` : ''}.`, [idReq?.idx, verified.idx], { confidence: 0.92 });
    }
    if (disclose) {
      return res('no', `${crit.title} — Нет. Оператор раскрыл данные по счёту без подтверждения личности: ${q(disclose)}.`, [disclose.idx], { checked_range: c.opRange, confidence: 0.75 });
    }
    if (c.conv.channel === 'voice call' && idReq) {
      const answer = lines.find((l) => l.idx > idReq.idx && l.speaker === 'client');
      return res('yes', `${crit.title} — Да. Оператор провёл идентификацию голосом: ${q(idReq)}${answer ? `, клиент ответил ${q(answer)}` : ''}.`, [idReq.idx, answer?.idx], { confidence: 0.6 });
    }
    if (idReq) {
      const reason = 'Оператор предложил идентификацию, но защищённое действие и раскрытие данных не выполнялись.';
      return res('na', `${crit.title} — N/A. ${reason} Основание — ${q(idReq)}.`, [idReq.idx], { na_reason: reason, confidence: 0.55 });
    }
    if (need && ops.length) {
      return res('no', `${crit.title} — Нет. Клиент обратился по своему счёту (${q(need)}), но проверка личности в чате не подтверждена.`, [need.idx], { checked_range: c.opRange, confidence: 0.55 });
    }
    const reason = 'Запрос общий и не требовал идентификации (нет раскрытия данных или защищённого действия).';
    return res('na', `${crit.title} — N/A. ${reason}`, [clients[0]?.idx], { na_reason: reason, confidence: 0.7 });
  },

  consultation(c, crit) {
    const { ops, clients, sys } = c;
    const substantive = ops.filter((l) => l.text.length > 45 && !(P.genericHelp.test(l.text) && l.text.length < 90));
    const abrupt = sys.find((l) => P.abrupt.test(l.text));
    if (!substantive.length) {
      if (abrupt || !ops.length) {
        const reason = 'Чат закончился до того, как клиент сформулировал запрос оператору.';
        return res('na', `${crit.title} — N/A. ${reason}${abrupt ? ` Основание — ${q(abrupt)}.` : ''}`, [abrupt?.idx, ops[0]?.idx], { na_reason: reason, confidence: 0.75 });
      }
      return res(0, `${crit.title} — 0. Ответа по существу нет.`, [], { checked_range: c.opRange, confidence: 0.6 });
    }
    const gross = ops.find((l) => P.personalMoney.test(l.text) || P.privatePaid.test(l.text));
    if (gross) return res(0, `${crit.title} — 0. Ключевая рекомендация ошибочна: оператор предлагает услугу в обход компании ${q(gross)}.`, [gross.idx], { confidence: 0.85 });
    const lastOp = ops[ops.length - 1];
    const tailClients = clients.filter((l) => l.idx > substantive[0].idx).slice(-3);
    const lastClient = clients[clients.length - 1];
    // last client question: unanswered, or brushed off with a short goodbye
    const lastQ = [...clients].reverse().find((l) => l.idx > ops[0].idx && l.text.includes('?'));
    const replyToQ = lastQ && ops.find((l) => l.idx > lastQ.idx);
    const unansweredQ = lastQ && (!replyToQ || (replyToQ === lastOp && P.farewell.test(replyToQ.text) && replyToQ.text.length < 80));
    const unanswered = unansweredQ ? lastQ : lastClient && lastClient.idx > lastOp.idx && lastClient.text.includes('?') ? lastClient : null;
    const confused = tailClients.find((l) => P.confused.test(l.text));
    const resolved = tailClients.find((l) => P.thanks.test(l.text));
    const best = substantive[substantive.length - 1];
    if (unanswered) {
      const brushed = replyToQ && unansweredQ ? ` Ответ оператора — ${q(replyToQ)}.` : '';
      return res(10, `${crit.title} — 10. Часть запроса закрыта, но существенный вопрос клиента остался без ответа: ${q(unanswered)}.${brushed}`, [best.idx, unanswered.idx, replyToQ?.idx], { confidence: 0.65 });
    }
    if (confused) return res(5, `${crit.title} — 5. Есть общая подсказка, но клиенту всё ещё непонятно, как действовать: ${q(confused)}.`, [best.idx, confused.idx], { confidence: 0.55 });
    if (resolved) {
      return res(20, `${crit.title} — 20. Вопрос закрыт или дан корректный следующий шаг; клиент подтвердил: ${q(resolved)}. Ключевой ответ — ${q(best)}.`, [best.idx, resolved.idx], { confidence: 0.65 });
    }
    const step = substantive.find((l) => P.escalate.test(l.text));
    if (step) return res(20, `${crit.title} — 20. Дан корректный следующий шаг: ${q(step)}.`, [step.idx], { confidence: 0.55 });
    return res(15, `${crit.title} — 15. Основной вопрос решён, подтверждения клиента о полном решении нет. Ключевой ответ — ${q(best)}.`, [best.idx], { confidence: 0.5 });
  },

  empathy(c, crit) {
    const { ops, clients } = c;
    if (!ops.length) return res('no', `${crit.title} — Нет. Оператор не вступил в диалог.`, []);
    const rude = ops.find((l) => P.rude.test(l.text));
    if (rude) return res('no', `${crit.title} — Нет. Невежливая реплика оператора: ${q(rude)}.`, [rude.idx], { confidence: 0.9 });
    const neg = clients.find((l) => P.neg.test(l.text));
    if (neg) {
      const emp = ops.find((l) => P.empathy.test(l.text));
      if (emp) return res('yes', `${crit.title} — Да. Клиент описал неудобство (${q(neg)}), оператор отреагировал на конкретную проблему: ${q(emp)}.`, [neg.idx, emp.idx], { confidence: 0.75 });
      return res('no', `${crit.title} — Нет. Клиент описал неудобство (${q(neg)}), но оператор не отреагировал на него — ответил только по процедуре.`, [neg.idx], { checked_range: [ops[0].idx, ops[ops.length - 1].idx], confidence: 0.6 });
    }
    return res('yes', `${crit.title} — Да. Клиент не выражал недовольства; тон оператора вежливый. Основание — ${q(ops[0])}.`, [ops[0].idx], { confidence: 0.7 });
  },

  dialog(c, crit) {
    const { ops, lines } = c;
    if (!ops.length) return res(0, `${crit.title} — 0. Оператор не вступил в диалог.`, []);
    const issues = [];
    // waits: a long pause between operator replies inside the dialog with no warning
    for (let i = 1; i < ops.length; i++) {
      const prev = ops[i - 1];
      const cur = ops[i];
      const clientBetween = lines.some((l) => l.idx > prev.idx && l.idx < cur.idx && l.speaker === 'client');
      if (!clientBetween || prev.t == null || cur.t == null) continue;
      const lastClient = [...lines].reverse().find((l) => l.idx < cur.idx && l.speaker === 'client');
      const gap = cur.t - (lastClient?.t ?? prev.t);
      if (gap >= 150 && !P.wait.test(prev.text)) issues.push({ kind: 'wait', line: cur, gap });
    }
    const reasks = lines.filter((l) => l.speaker === 'client' && l.idx > ops[0].idx && P.misunderstood.test(l.text));
    reasks.forEach((l) => issues.push({ kind: 'reask', line: l }));
    const ev = issues.map((i) => i.line.idx);
    if (reasks.length >= 2) return res(0, `${crit.title} — 0. Клиент несколько раз не понимает ответы: ${reasks.map((l) => q(l, 70)).join('; ')}.`, ev, { confidence: 0.55 });
    if (reasks.length === 1) return res(4, `${crit.title} — 4. Клиенту пришлось переспрашивать из-за формулировок: ${q(reasks[0])}.`, ev, { confidence: 0.6 });
    if (issues.length) {
      const w = issues[0];
      return res(7, `${crit.title} — 7. Один заметный сбой: пауза ≈${Math.round(w.gap / 60)} мин без предупреждения об ожидании перед ${q(w.line)}.`, ev, { confidence: 0.6 });
    }
    return res(10, `${crit.title} — 10. Ответы ясные и последовательные, ожиданий без предупреждения не найдено.`, [ops[ops.length - 1].idx], { checked_range: c.opRange, confidence: 0.6 });
  },

  closing(c, crit) {
    const { ops, sys, lines } = c;
    if (!ops.length) {
      const reason = 'Оператор не вступил в диалог — завершать было нечего.';
      return res('na', `${crit.title} — N/A. ${reason}`, [], { na_reason: reason });
    }
    const tail = ops.slice(-2);
    const bye = tail.find((l) => P.farewell.test(l.text));
    const offer = ops.slice(-3).find((l) => P.offer.test(l.text));
    const bare = bye && !offer && bye.text.replace(/[^\p{L}\s]/gu, '').trim().length <= 14;
    if (bare) {
      return res('no', `${crit.title} — Нет. Только формальное прощание без итога и предложения помощи. Основание — ${q(bye)}.`, [bye.idx], { checked_range: [ops[Math.max(0, ops.length - 3)].idx, bye.idx], confidence: 0.6 });
    }
    if (bye) return res('yes', `${crit.title} — Да. Оператор ${offer ? 'предложил дальнейшую помощь и ' : ''}попрощался. Основание — ${q(bye)}.`, [offer?.idx, bye.idx], { confidence: 0.9 });
    const lastOp = ops[ops.length - 1];
    const abrupt = sys.find((l) => P.abrupt.test(l.text) && l.idx > lastOp.idx);
    if (abrupt) {
      const reason = 'Чат оборвался со стороны клиента до того, как оператор мог его завершить.';
      return res('na', `${crit.title} — N/A. ${reason} Основание — ${q(abrupt)}.`, [abrupt.idx], { na_reason: reason, confidence: 0.8 });
    }
    const closed = sys.find((l) => P.closedByOp.test(l.text));
    return res('no', `${crit.title} — Нет. Оператор не подвёл итог и не попрощался. Основание — последняя реплика оператора ${q(lastOp)}${closed ? ` и сообщение ${q(closed)}` : ''}.`, [lastOp.idx, closed?.idx], { checked_range: [lastOp.idx, lines[lines.length - 1].idx], confidence: 0.8 });
  },

  gross(c, crit) {
    const { ops } = c;
    const hits = [];
    for (const l of ops) {
      if (P.personalMoney.test(l.text)) hits.push({ l, kind: 'предложение перевести деньги оператору лично (в обход компании)' });
      else if (P.privatePaid.test(l.text)) hits.push({ l, kind: 'предложение платной частной консультации в обход компании' });
      else if (P.rude.test(l.text)) hits.push({ l, kind: 'оскорбление клиента' });
      else if (P.confidential.test(l.text)) hits.push({ l, kind: 'раскрытие конфиденциальной информации' });
    }
    if (hits.length) {
      return res('yes', `${crit.title} — Да. Выявлено: ${[...new Set(hits.map((h) => h.kind))].join('; ')}. Основание — ${hits.map((h) => q(h.l, 110)).join('; ')}.`, hits.map((h) => h.l.idx), { confidence: 0.9 });
    }
    return res('no', `${crit.title} — Нет. Оскорблений, предложений платных услуг в обход компании и раскрытия конфиденциальной информации не выявлено.`, [], { checked_range: c.opRange, confidence: 0.8 });
  },

  keywords(c, crit) {
    const words = String(crit.keywords || '').split(',').map((w) => w.trim()).filter(Boolean);
    const pool = c.ops;
    if (!words.length) {
      const reason = 'Офлайн-движок не знает этот критерий: добавьте ключевые слова или запустите оценку через Claude.';
      if (crit.allow_na) return res('na', `${crit.title} — N/A. ${reason}`, [], { na_reason: reason, confidence: 0.2, needs_review: true });
      return res(crit.type === 'scale' ? 0 : 'no', `${crit.title} — требуется проверка. ${reason}`, [], { confidence: 0.2, needs_review: true });
    }
    const re = new RegExp(words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'iu');
    const hit = pool.find((l) => re.test(l.text));
    const max = Math.max(...(crit.scale || [{ value: 0 }]).map((s) => Number(s.value)));
    const min = Math.min(...(crit.scale || [{ value: 0 }]).map((s) => Number(s.value)));
    if (hit) {
      const ans = crit.type === 'scale' ? max : 'yes';
      return res(ans, `${crit.title} — ${crit.type === 'scale' ? ans : 'Да'}. Найдена подтверждающая реплика оператора: ${q(hit)}.`, [hit.idx], { confidence: 0.6 });
    }
    if (crit.allow_na && !pool.length) {
      const reason = 'Оператор не вступил в диалог.';
      return res('na', `${crit.title} — N/A. ${reason}`, [], { na_reason: reason });
    }
    const ans = crit.type === 'scale' ? min : 'no';
    return res(ans, `${crit.title} — ${crit.type === 'scale' ? ans : 'Нет'}. В репликах оператора не найдено ожидаемых формулировок (${words.slice(0, 5).join(', ')}).`, [], { checked_range: c.opRange, confidence: 0.5 });
  },
};

export function evaluateWithRules(conv, checklist) {
  const ctx = context(conv);
  const criteria = checklist.criteria.map((crit) => {
    const fn = detectors[crit.rule] || detectors.keywords;
    const r = fn(ctx, crit);
    return { criterion_id: crit.id, ...r };
  });
  return {
    criteria,
    summary: null,
    engine: 'rules',
    model: 'cqa-rules-v1',
    usage: null,
    cost_usd: 0,
  };
}

export const RULE_TYPES = ['greeting', 'needs', 'identification', 'consultation', 'empathy', 'dialog', 'closing', 'gross', 'keywords'];
