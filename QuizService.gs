/**
 * Sessions that are published, currently within their valid window, and
 * targeted at the employee's company (or open to everyone), annotated with
 * whether the employee already passed each one.
 */
function getEligibleSessions_(employeeId) {
  const db = getDb_();
  const employee = findById_(db, SHEETS.EMPLOYEES, employeeId);
  const now = new Date();

  const sessions = findRows_(db, SHEETS.QUIZ_SESSIONS, function (row) {
    if (row.status !== 'published') {
      return false;
    }
    if (new Date(row.valid_from) > now || new Date(row.valid_until) < now) {
      return false;
    }

    const targetIds = parseJsonList_(row.target_company_ids);
    if (targetIds.length === 0) {
      return true;
    }

    return targetIds.some(function (id) {
      return String(id) === String(employee.company_id);
    });
  });

  return sessions.map(function (session) {
    const topic = findById_(db, SHEETS.QUIZ_TOPICS, session.topic_id);
    const passed = findRows_(db, SHEETS.QUIZ_PARTICIPATIONS, function (p) {
      return String(p.session_id) === String(session.id) &&
        String(p.employee_id) === String(employeeId) &&
        p.passed === true;
    });

    const out = toPublic_(session);
    out.topic_title = topic ? topic.title : '';
    out.already_passed = passed.length > 0;
    return out;
  });
}

function parseJsonList_(value) {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function getExistingPassedResult_(sessionId, employeeId) {
  const db = getDb_();

  const passed = findRows_(db, SHEETS.QUIZ_PARTICIPATIONS, function (p) {
    return String(p.session_id) === String(sessionId) &&
      String(p.employee_id) === String(employeeId) &&
      p.passed === true;
  }).sort(function (a, b) {
    return new Date(b.submitted_at) - new Date(a.submitted_at);
  })[0];

  return passed ? toPublic_(passed) : null;
}

function getTopicForSession_(sessionId) {
  const db = getDb_();
  const session = findById_(db, SHEETS.QUIZ_SESSIONS, sessionId);

  if (!session) {
    throw new Error('Session tidak ditemukan.');
  }

  const topic = findById_(db, SHEETS.QUIZ_TOPICS, session.topic_id);
  return toPublic_(topic);
}

/**
 * Starts (or restarts) an attempt: creates a QuizParticipations row, picks
 * `questions_per_attempt` random active questions from the topic's bank,
 * shuffles each question's options, and returns them WITHOUT the correct_key
 * (so the browser never sees the answer). The exact question ids shown are
 * stored in the participation's `meta` so grading can look up correct_key
 * again at submit time.
 */
function startQuizAttempt_(sessionId, employeeId, requestMeta) {
  const db = getDb_();
  const session = findById_(db, SHEETS.QUIZ_SESSIONS, sessionId);
  const topic = findById_(db, SHEETS.QUIZ_TOPICS, session.topic_id);

  const activeQuestions = findRows_(db, SHEETS.QUIZ_QUESTIONS, function (q) {
    return String(q.topic_id) === String(topic.id) && q.is_active === true;
  });

  const shuffled = shuffle_(activeQuestions.slice());
  const picked = shuffled.slice(0, Number(topic.questions_per_attempt) || shuffled.length);

  const attemptNo = 1 + findRows_(db, SHEETS.QUIZ_PARTICIPATIONS, function (p) {
    return String(p.session_id) === String(sessionId) && String(p.employee_id) === String(employeeId);
  }).reduce(function (max, p) {
    return Math.max(max, Number(p.attempt_no) || 0);
  }, 0);

  const meta = Object.assign({ question_ids: picked.map(function (q) { return q.id; }) }, requestMeta || {});

  const participationId = insertRow_(db, SHEETS.QUIZ_PARTICIPATIONS, {
    session_id: sessionId,
    employee_id: employeeId,
    attempt_no: attemptNo,
    started_at: new Date(),
    submitted_at: '',
    score: '',
    passed: false,
    certificate_no: '',
    certificate_issued_at: '',
    verification_token: '',
    meta: JSON.stringify(meta),
  });

  const questionsForClient = picked.map(function (q) {
    const options = parseJsonList_(q.options);
    return {
      id: q.id,
      question: q.question,
      options: shuffle_(options.slice()),
    };
  });

  return { participationId: participationId, questions: questionsForClient };
}

function shuffle_(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = array[i];
    array[i] = array[j];
    array[j] = tmp;
  }
  return array;
}

/**
 * @param answers {Object} question id (string) => selected key
 */
function submitQuizAttempt_(participationId, answers) {
  const db = getDb_();
  const participation = findById_(db, SHEETS.QUIZ_PARTICIPATIONS, participationId);
  const session = findById_(db, SHEETS.QUIZ_SESSIONS, participation.session_id);
  const topic = findById_(db, SHEETS.QUIZ_TOPICS, session.topic_id);
  const meta = JSON.parse(participation.meta || '{}');
  const questionIds = meta.question_ids || [];

  let correct = 0;

  questionIds.forEach(function (qid) {
    const question = findById_(db, SHEETS.QUIZ_QUESTIONS, qid);
    const selected = answers[qid] || '';
    const isCorrect = !!selected && selected === question.correct_key;

    if (isCorrect) {
      correct++;
    }

    insertRow_(db, SHEETS.QUIZ_ANSWERS, {
      participation_id: participationId,
      question_id: qid,
      selected_key: selected,
      is_correct: isCorrect,
    });
  });

  const total = questionIds.length;
  const score = total > 0 ? Math.round((correct / total) * 100) : 0;
  const passed = score >= Number(topic.pass_threshold);

  const update = {
    submitted_at: new Date(),
    score: score,
    passed: passed,
  };

  if (passed) {
    update.certificate_no = generateCertificateNumber_(participation);
    update.certificate_issued_at = new Date();
    update.verification_token = Utilities.getUuid();
  }

  updateRow_(db, SHEETS.QUIZ_PARTICIPATIONS, participationId, update);

  return {
    score: score,
    passed: passed,
    certificateNo: update.certificate_no || null,
    verificationToken: update.verification_token || null,
  };
}
