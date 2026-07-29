// ==UserScript==
// @name         国家智慧教育平台小功能 Patch
// @namespace    http://tampermonkey.net/
// @version      1.29
// @description  自动跳过弱密码弹窗、密码框默认明文显示、自动勾选同意登录政策协议、自动展开指定课程章节、准备刷课后自动刷新并进入视频，播放完成后自动切换下一个视频并显示学习/学时进度
// @author       Antigravity
// @match        https://auth.smartedu.cn/uias/login*
// @match        https://basic.smartedu.cn/*
// @match        https://www.smartedu.cn/*
// @match        https://teacher.vocational.smartedu.cn/*
// @match        https://core.teacher.vocational.smartedu.cn/*
// @match        https://basic.smartedu.cn/*?*contentId=*
// @match        https://www.smartedu.cn/*?*contentId=*
// @match        https://teacher.vocational.smartedu.cn/*?*contentId=*
// @match        https://core.teacher.vocational.smartedu.cn/*?*contentId=*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    let handledModal = false;
    let prepareStudyRefreshTimer = null;
    let enteredVideoAfterReload = false;
    let autoNextVideoTriggered = false;
    let lastAutoNextVideoKey = '';
    let progressPanel = null;
    let lastProgressPanelHtml = '';
    let accountStorageHash = '';
    let accountStorageHashSource = '';
    let accountStorageHashPromise = null;
    let progressMenuOpen = false;
    let lastTrainingHoursFetchAt = 0;
    let trainingHoursFetchPromise = null;

    // ===== 课程白名单配置 =====
    // displayTitle: Panel 显示名；requiredHours: 学时达标判断兜底值。
    // sectionTitles/resourceTitles: 只展开和学习这些章节、视频。
    const autoExpandCourseConfigs = [
        {
            displayTitle: '大力弘扬教育家精神',
            courseId: '79d28f6c-0b8a-443d-bdda-a78165c462f3',
            requiredHours: 2,
            sectionTitles: [
                '教育家精神培育在线课程',
                '弘扬教育家精神勇担强国建设使命',
                '做一名躬耕教坛、强国有我的教师'
            ],
            resourceTitles: [
                '教育家精神培育在线课程',
                '弘扬教育家精神勇担强国建设使命(一)',
                '弘扬教育家精神勇担强国建设使命(二)',
                '弘扬教育家精神勇担强国建设使命(三)',
                '做一名躬耕教坛、强国有我的教师(一)',
                '做一名躬耕教坛、强国有我的教师(二)',
                '做一名躬耕教坛、强国有我的教师(三)',
                '做一名躬耕教坛、强国有我的教师(四)'
            ]
        },
        {
            displayTitle: '数智素养提升',
            courseId: '165d9433-5486-43e4-926e-3f33b92635e4',
            requiredHours: 3,
            sectionTitles: [
                '中小学人工智能通识教育—教师培训课程（2026）'
            ],
            resourceTitles: [
                '01-引言',
                '02-人工智能的源头和历史',
                '03-人工智能的丰硕之果与绚烂之花',
                '04-人工智能的繁茂之叶与茁壮之枝',
                '05-人工智能的遒劲之干与深厚之根',
                '06-一窥人工智能知识树的全貌',
                '07-人工智能通识教育的目标',
                '08-案例（小学低段1-2年级）-玩转机器'
            ]
        },
        {
            displayTitle: '科学素养提升',
            courseId: 'b2ec4202-c747-4ad2-a1b1-35a6c277c856',
            requiredHours: 1,
            sectionTitles: [
                '科学教师特色研修班'
            ],
            resourceTitles: [
                '当AI拿起画笔'
            ]
        },
        {
            displayTitle: '心理健康教育能力提升',
            courseId: 'ca2a448a-5ff5-4183-92c2-6506f6696228',
            requiredHours: 1,
            sectionTitles: [
                '班主任开展家庭教育的智慧与策略'
            ],
            resourceTitles: [
                '班主任开展家庭教育的智慧与策略'
            ]
        },
        {
            displayTitle: '学科美育教学改革专题培训',
            courseId: '6a46308e-17ff-456a-a320-b5bdb494e93d',
            requiredHours: 3,
            sectionTitles: [
                '1作为教育目的的美育及其实践',
                '2学科美育的定位、目标和路径',
                '4语文美育：让审美与学科教学深度融合'
            ],
            resourceTitles: [
                '学科美育概念的意义理解与落实',
                '学科美育的定位、目标和路径',
                '01语文美育：让审美与学科教学深度融合',
                '02小学语文美育案例',
                '03初中语文美育案例'
            ]
        }
    ];

    const prepareStudyDelayMs = 4000;
    const autoNextVideoClickDelayMs = 100;
    const autoNextVideoCooldownMs = 2000;
    const prepareStudyStateKey = 'smarteduPatchPrepareStudyState';
    const currentResourceStateKey = 'smarteduPatchCurrentResourceState';
    const progressStateKey = 'smarteduPatchCourseProgressState';
    const trainingHoursStateKey = 'smarteduPatchTrainingHoursState';
    const manualAccountKey = 'smarteduPatchManualAccountLabel';
    const trainingOverviewUrl = 'https://basic.smartedu.cn/training/dc6d78f2-bad8-4d09-b8da-0d758803dbe4';
    const scriptVersion = '1.29';
    const authorName = '王虾虾';
    const authorBlogUrl = 'https://xavier.wang';
    const githubRepoUrl = 'https://github.com/XavierWang3P/hydrachs-smartedu-studying-patch';
    const trainingHoursFetchIntervalMs = 60000;
    const resourceHighlightStyleId = 'smartedu-patch-resource-highlight-style';
    const storageBaseKeys = [
        currentResourceStateKey,
        progressStateKey,
        trainingHoursStateKey
    ];

    // ===== 通用工具 =====
    function normalizeText(text) {
        return (text || '').replace(/\s+/g, '').trim();
    }

    function applyStyles(element, styles) {
        Object.assign(element.style, styles);
        return element;
    }

    // ===== 账号识别与账号隔离存储 =====
    // 所有学习进度都按账号哈希分区，避免切换账号后沿用上一个账号的本地记录。
    function getManualAccountLabel() {
        return normalizeText(sessionStorage.getItem(manualAccountKey) || '');
    }

    function setManualAccountLabel(accountLabel) {
        const normalizedAccountLabel = normalizeText(accountLabel);
        if (normalizedAccountLabel) {
            sessionStorage.setItem(manualAccountKey, normalizedAccountLabel);
        } else {
            sessionStorage.removeItem(manualAccountKey);
        }
        accountStorageHash = '';
        accountStorageHashSource = '';
        accountStorageHashPromise = null;
        lastProgressPanelHtml = '';
    }

    function detectAccountLabelFromDom() {
        if (!document.body) {
            return '';
        }

        const usernameElement = document.querySelector('[class*="username-wrap"][title], .theme-username, [class*="username_"]');
        const usernameText = normalizeText(usernameElement?.getAttribute?.('title') || usernameElement?.textContent || '');
        if (usernameText) {
            return usernameText;
        }
        return '';
    }

    function getAccountLabel() {
        return detectAccountLabelFromDom() || getManualAccountLabel() || '默认账号';
    }

    async function sha256Text(text) {
        const bytes = new TextEncoder().encode(text);
        const hash = await crypto.subtle.digest('SHA-256', bytes);
        return Array.from(new Uint8Array(hash))
            .map(byte => byte.toString(16).padStart(2, '0'))
            .join('');
    }

    function fallbackHashText(text) {
        let hash = 2166136261;
        for (let i = 0; i < text.length; i += 1) {
            hash ^= text.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
    }

    function ensureAccountStorageHash() {
        const accountLabel = getAccountLabel();
        if (accountStorageHash && accountStorageHashSource === accountLabel) {
            return;
        }
        if (accountStorageHashPromise && accountStorageHashSource === accountLabel) {
            return;
        }

        accountStorageHash = '';
        accountStorageHashSource = accountLabel;
        if (typeof crypto === 'undefined' || !crypto.subtle) {
            accountStorageHash = fallbackHashText(accountLabel);
            accountStorageHashPromise = null;
            return;
        }

        accountStorageHashPromise = sha256Text(accountLabel)
            .then(hash => {
                if (accountStorageHashSource === accountLabel) {
                    accountStorageHash = hash;
                    accountStorageHashPromise = null;
                    lastProgressPanelHtml = '';
                    updateProgressPanel();
                }
            })
            .catch(() => {
                if (accountStorageHashSource === accountLabel) {
                    accountStorageHash = fallbackHashText(accountLabel);
                    accountStorageHashPromise = null;
                }
            });
    }

    function getScopedStorageKey(baseKey) {
        ensureAccountStorageHash();
        return accountStorageHash ? `${baseKey}:${accountStorageHash}` : '';
    }

    function getCurrentCourseId() {
        return new URLSearchParams(location.search).get('courseId');
    }

    function isTeacherTrainingCoursePage() {
        return location.hostname.includes('basic.smartedu.cn')
            && (
                location.pathname.includes('/teacherTraining/courseIndex')
                || location.pathname.includes('/teacherTraining/courseDetail')
            );
    }

    function getCourseConfigById(courseId) {
        return autoExpandCourseConfigs.find(item => item.courseId === courseId) || null;
    }

    function getCurrentCourseConfig() {
        return getCourseConfigById(getCurrentCourseId());
    }

    function getNextCourseConfig(courseId) {
        const currentIndex = autoExpandCourseConfigs.findIndex(item => item.courseId === courseId);
        if (currentIndex < 0 || currentIndex >= autoExpandCourseConfigs.length - 1) {
            return null;
        }
        return autoExpandCourseConfigs[currentIndex + 1];
    }

    function getCourseIndexUrl(courseId) {
        return `https://basic.smartedu.cn/teacherTraining/courseIndex?courseId=${encodeURIComponent(courseId)}`;
    }

    function isTrainingOverviewPage() {
        return location.hostname.includes('basic.smartedu.cn')
            && location.pathname.includes('/training/dc6d78f2-bad8-4d09-b8da-0d758803dbe4');
    }

    // ===== 学时进度解析 =====
    function extractNumbers(text) {
        return (text || '').match(/\d+(?:\.\d+)?/g) || [];
    }

    function readFirstNumber(text) {
        const numbers = extractNumbers(text);
        return numbers.length ? numbers[0] : '';
    }

    function toNumber(value) {
        const number = Number.parseFloat(value);
        return Number.isFinite(number) ? number : 0;
    }

    function isCourseHoursCompleted(config, courseHours) {
        if (!courseHours) {
            return false;
        }

        const configuredRequiredHours = toNumber(config.requiredHours);
        const requiredHours = toNumber(courseHours.requiredHours) || configuredRequiredHours;
        const certifiedHours = toNumber(courseHours.certifiedHours);
        const learnedHours = toNumber(courseHours.learnedHours);

        if (requiredHours <= 0) {
            return false;
        }
        // 平台有些专题不在卡片内显示认定学时，已学习学时可作为兜底完成判断。
        return certifiedHours >= requiredHours || learnedHours >= requiredHours;
    }

    function readBlockTextNumber(root, blockSelector, keyword, valueSelector) {
        const blocks = Array.from(root.querySelectorAll(blockSelector));
        const block = blocks.find(item => normalizeText(item.textContent).includes(keyword));
        if (!block) {
            return '';
        }

        const valueElement = valueSelector ? block.querySelector(valueSelector) : null;
        return readFirstNumber(valueElement?.textContent || block.textContent);
    }

    function parseTrainingTotalHours(doc) {
        const totalRoot = Array.from(doc.querySelectorAll('[class*="topprocess"]'))
            .find(element => {
                const text = normalizeText(element.textContent);
                return text.includes('总进度') && text.includes('已学习') && text.includes('已认定');
            });
        if (!totalRoot) {
            return null;
        }

        const totalText = totalRoot.textContent || '';
        const percentMatch = totalText.match(/\d+(?:\.\d+)?%/);
        const learnedHours = readBlockTextNumber(totalRoot, '[class*="topprocessCBBlock"]', '已学习', '[class*="topprocessCMy"]');
        const certifiedBlock = Array.from(totalRoot.querySelectorAll('[class*="topprocessCBBlock"]'))
            .find(block => normalizeText(block.textContent).includes('已认定'));
        const certifiedNumbers = extractNumbers(certifiedBlock?.textContent || '');

        return {
            percent: percentMatch ? percentMatch[0] : '',
            learnedHours,
            certifiedHours: certifiedNumbers[0] || '',
            requiredHours: certifiedNumbers[1] || '',
            statusText: normalizeText(totalRoot.textContent).includes('已完成') ? '已完成' : ''
        };
    }

    function findTrainingCourseCard(doc, displayTitle) {
        const targetTitle = normalizeText(displayTitle);
        const titleElements = Array.from(doc.querySelectorAll('[class*="title"]'));
        const titleElement = titleElements.find(element => normalizeText(element.textContent) === targetTitle);
        return titleElement?.closest?.('[class*="course"]') || null;
    }

    function parseTrainingCourseHours(card) {
        if (!card) {
            return null;
        }

        const progressBlock = Array.from(card.querySelectorAll('[class*="process"]'))
            .find(element => {
                const text = normalizeText(element.textContent);
                return text.includes('学习进度') && text.includes('已学习');
            });
        if (!progressBlock) {
            return null;
        }

        const learnedHours = readBlockTextNumber(progressBlock, '[class*="processC"]', '已学习', '[class*="processCMy"]')
            || readFirstNumber(progressBlock.textContent);
        const certifiedBlock = Array.from(progressBlock.querySelectorAll('[class*="processC"]'))
            .find(block => normalizeText(block.textContent).includes('已认定'));
        const certifiedNumbers = extractNumbers(certifiedBlock?.textContent || '');

        return {
            learnedHours,
            certifiedHours: certifiedNumbers[0] || '',
            requiredHours: certifiedNumbers[1] || ''
        };
    }

    function parseCertifiedHoursFromText(text) {
        const normalizedText = normalizeText(text);
        if (!normalizedText.includes('已认定') || !normalizedText.includes('认定') || !normalizedText.includes('学时')) {
            return null;
        }

        const numbers = extractNumbers(text);
        if (numbers.length < 2) {
            return null;
        }

        return {
            certifiedHours: numbers[0] || '',
            requiredHours: numbers[1] || ''
        };
    }

    function findNearestPhaseHoursBeforeCard(doc, card) {
        if (!card) {
            return null;
        }

        // 学科美育等专题的认定学时在课程卡片上方的阶段表头中显示。
        const phaseElements = Array.from(doc.querySelectorAll('[class*="phase"], [class*="peroid"], [class*="period"]'))
            .filter(element => card.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_PRECEDING);

        for (let index = phaseElements.length - 1; index >= 0; index -= 1) {
            const phaseHours = parseCertifiedHoursFromText(phaseElements[index].textContent || '');
            if (phaseHours) {
                return phaseHours;
            }
        }

        return null;
    }

    function parseTrainingHoursFromDocument(doc) {
        const courses = {};
        autoExpandCourseConfigs.forEach(config => {
            const card = findTrainingCourseCard(doc, config.displayTitle);
            const hours = parseTrainingCourseHours(card);
            if (hours) {
                const phaseHours = findNearestPhaseHoursBeforeCard(doc, card);
                if (phaseHours && (!hours.certifiedHours || !hours.requiredHours)) {
                    hours.certifiedHours = hours.certifiedHours || phaseHours.certifiedHours;
                    hours.requiredHours = hours.requiredHours || phaseHours.requiredHours;
                    hours.certifiedSource = 'phase';
                }
                courses[config.courseId] = hours;
            }
        });

        return {
            total: parseTrainingTotalHours(doc),
            courses,
            updatedAt: Date.now()
        };
    }

    // ===== 页面定位与课程目录工具 =====
    function getButtonFromEventTarget(target) {
        if (!target) {
            return null;
        }
        if (target.closest) {
            return target.closest('button');
        }
        return target.parentElement?.closest?.('button') || null;
    }

    function findCourseHeaderByTitle(title) {
        const targetTitle = normalizeText(title);
        const headers = document.querySelectorAll('.fish-collapse-header[role="button"], .fish-collapse-header');

        return Array.from(headers).find(header => {
            const headerText = normalizeText(header.textContent);
            return headerText === targetTitle || headerText.endsWith(targetTitle);
        }) || null;
    }

    function getPrepareStudyState() {
        try {
            const rawState = sessionStorage.getItem(prepareStudyStateKey);
            return rawState ? JSON.parse(rawState) : null;
        } catch (error) {
            sessionStorage.removeItem(prepareStudyStateKey);
            return null;
        }
    }

    function setPrepareStudyState(state) {
        sessionStorage.setItem(prepareStudyStateKey, JSON.stringify({
            ...state,
            createdAt: Date.now()
        }));
    }

    function clearPrepareStudyState() {
        sessionStorage.removeItem(prepareStudyStateKey);
    }

    function getCurrentResourceState() {
        const scopedResourceStateKey = getScopedStorageKey(currentResourceStateKey);
        if (!scopedResourceStateKey) {
            return null;
        }
        try {
            const rawState = sessionStorage.getItem(scopedResourceStateKey);
            return rawState ? JSON.parse(rawState) : null;
        } catch (error) {
            sessionStorage.removeItem(scopedResourceStateKey);
            return null;
        }
    }

    function setCurrentResourceState(state) {
        const scopedResourceStateKey = getScopedStorageKey(currentResourceStateKey);
        if (!scopedResourceStateKey) {
            return;
        }
        sessionStorage.setItem(scopedResourceStateKey, JSON.stringify({
            ...state,
            createdAt: Date.now()
        }));
    }

    function isCourseDetailPage() {
        return isTeacherTrainingCoursePage()
            && location.pathname.includes('/teacherTraining/courseDetail');
    }

    function getConfiguredResourceItems(config) {
        const resourceItems = config.sectionTitles
            .map(title => findCourseHeaderByTitle(title)?.closest('.fish-collapse-item'))
            .filter(Boolean)
            .flatMap(collapseItem => Array.from(collapseItem.querySelectorAll('.resource-item')));

        if (!config.resourceTitles?.length) {
            return resourceItems;
        }

        const targetResourceTitles = config.resourceTitles.map(normalizeText);
        return resourceItems.filter(resourceItem => {
            const resourceTitle = getResourceItemTitle(resourceItem);
            return targetResourceTitles.some(targetTitle => resourceTitle === targetTitle || resourceTitle.endsWith(targetTitle));
        });
    }

    function getResourceItemTitle(resourceItem) {
        const titleElement = resourceItem?.children?.[0];
        return normalizeText(titleElement?.textContent || resourceItem?.textContent || '');
    }

    function getCourseDisplayTitle(config, index) {
        return config.displayTitle || `页面${index + 1}`;
    }

    // ===== 进度状态读写 =====
    function getProgressState() {
        const scopedProgressStateKey = getScopedStorageKey(progressStateKey);
        if (!scopedProgressStateKey) {
            return {};
        }
        try {
            const rawState = localStorage.getItem(scopedProgressStateKey);
            return rawState ? JSON.parse(rawState) : {};
        } catch (error) {
            localStorage.removeItem(scopedProgressStateKey);
            return {};
        }
    }

    function setProgressState(state) {
        const scopedProgressStateKey = getScopedStorageKey(progressStateKey);
        if (!scopedProgressStateKey) {
            return;
        }
        localStorage.setItem(scopedProgressStateKey, JSON.stringify(state));
    }

    function getTrainingHoursState() {
        const scopedTrainingHoursStateKey = getScopedStorageKey(trainingHoursStateKey);
        if (!scopedTrainingHoursStateKey) {
            return {};
        }
        try {
            const rawState = localStorage.getItem(scopedTrainingHoursStateKey);
            return rawState ? JSON.parse(rawState) : {};
        } catch (error) {
            localStorage.removeItem(scopedTrainingHoursStateKey);
            return {};
        }
    }

    function setTrainingHoursState(state) {
        const scopedTrainingHoursStateKey = getScopedStorageKey(trainingHoursStateKey);
        if (!scopedTrainingHoursStateKey) {
            return;
        }
        localStorage.setItem(scopedTrainingHoursStateKey, JSON.stringify(state));
    }

    // 从培训总览页读取总学时和每个专题的学时，使用强节流避免频繁请求。
    function syncTrainingHours(force = false) {
        if (!location.hostname.includes('basic.smartedu.cn')) {
            return;
        }
        ensureAccountStorageHash();
        if (!accountStorageHash) {
            return;
        }
        if (trainingHoursFetchPromise) {
            return;
        }
        if (!force && Date.now() - lastTrainingHoursFetchAt < trainingHoursFetchIntervalMs) {
            return;
        }

        lastTrainingHoursFetchAt = Date.now();
        const readDocument = isTrainingOverviewPage()
            ? Promise.resolve(document)
            : fetch(trainingOverviewUrl, { credentials: 'include' })
                .then(response => {
                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}`);
                    }
                    return response.text();
                })
                .then(html => new DOMParser().parseFromString(html, 'text/html'));

        trainingHoursFetchPromise = readDocument
            .then(doc => {
                const state = parseTrainingHoursFromDocument(doc);
                const hasTotal = !!state.total;
                const hasCourses = Object.keys(state.courses).length > 0;
                if (hasTotal || hasCourses) {
                    setTrainingHoursState({
                        ...state,
                        sourceUrl: trainingOverviewUrl
                    });
                    lastProgressPanelHtml = '';
                    updateProgressPanel();
                }
            })
            .catch(error => {
                console.warn('[SmartEdu Patch] 获取学时进度失败：', error);
            })
            .finally(() => {
                trainingHoursFetchPromise = null;
            });
    }

    function clearCurrentAccountProgress() {
        const scopedResourceStateKey = getScopedStorageKey(currentResourceStateKey);
        const scopedProgressStateKey = getScopedStorageKey(progressStateKey);
        const scopedTrainingHoursStateKey = getScopedStorageKey(trainingHoursStateKey);
        if (scopedResourceStateKey) {
            sessionStorage.removeItem(scopedResourceStateKey);
        }
        if (scopedProgressStateKey) {
            localStorage.removeItem(scopedProgressStateKey);
        }
        if (scopedTrainingHoursStateKey) {
            localStorage.removeItem(scopedTrainingHoursStateKey);
        }
        lastProgressPanelHtml = '';
        updateProgressPanel();
    }

    function clearAllAccountProgress() {
        storageBaseKeys.forEach(baseKey => {
            Object.keys(localStorage)
                .filter(key => key.startsWith(`${baseKey}:`))
                .forEach(key => localStorage.removeItem(key));
            Object.keys(sessionStorage)
                .filter(key => key.startsWith(`${baseKey}:`))
                .forEach(key => sessionStorage.removeItem(key));
        });
        lastProgressPanelHtml = '';
        updateProgressPanel();
    }

    function isLearnedResourceItem(resourceItem) {
        return !!resourceItem.querySelector('.status-icon [title*="已学完"], .icon_checkbox_fill[title*="已学完"]');
    }

    function isReplayButtonVisible() {
        return Array.from(document.querySelectorAll('.course-video-reload'))
            .some(button => normalizeText(button.textContent).includes('再学一遍') && isVisibleElement(button));
    }

    function syncCurrentCourseProgress() {
        if (!isTeacherTrainingCoursePage()) {
            return;
        }

        const config = getCurrentCourseConfig();
        if (!config) {
            return;
        }

        const resourceItems = getConfiguredResourceItems(config);
        if (!resourceItems.length) {
            return;
        }

        const learnedTitles = new Set(
            resourceItems
                .filter(isLearnedResourceItem)
                .map(getResourceItemTitle)
        );

        if (isReplayButtonVisible()) {
            const activeResourceItem = resourceItems.find(isActiveResourceItem);
            if (activeResourceItem) {
                learnedTitles.add(getResourceItemTitle(activeResourceItem));
            }
        }

        const state = getProgressState();
        const previousTitles = state[config.courseId]?.learnedTitles || [];
        previousTitles.forEach(title => {
            if (config.resourceTitles.map(normalizeText).includes(title)) {
                learnedTitles.add(title);
            }
        });

        state[config.courseId] = {
            learnedTitles: Array.from(learnedTitles),
            updatedAt: Date.now()
        };
        setProgressState(state);
    }

    function getCourseProgress(config, trainingHoursState = null) {
        const total = config.resourceTitles?.length || 0;
        const hoursState = trainingHoursState || getTrainingHoursState();
        const courseHours = hoursState.courses?.[config.courseId] || null;
        // Panel 的视频进度以“学时达标”为最高优先级：达标即显示 100%。
        if (total > 0 && isCourseHoursCompleted(config, courseHours)) {
            return {
                learned: total,
                total,
                completedByHours: true
            };
        }

        const state = getProgressState();
        const learnedTitles = state[config.courseId]?.learnedTitles || [];
        const targetTitles = new Set((config.resourceTitles || []).map(normalizeText));
        const learned = learnedTitles.filter(title => targetTitles.has(title)).length;
        return {
            learned: Math.min(learned, total),
            total,
            completedByHours: false
        };
    }

    // ===== Panel 渲染 =====
    function ensureProgressPanel() {
        if (progressPanel || !document.body) {
            return progressPanel;
        }

        progressPanel = document.createElement('div');
        progressPanel.id = 'smartedu-patch-progress-panel';
        progressPanel.style.cssText = [
            'position: fixed',
            'left: 14px',
            'bottom: 14px',
            'z-index: 10006',
            'width: 310px',
            'padding: 12px',
            'border-radius: 12px',
            'border: 2px solid rgba(120, 255, 170, 0.65)',
            'background: rgba(255, 255, 255, 0.92)',
            'color: #263241',
            'font-size: 12px',
            'line-height: 1.35',
            'box-shadow: 0 0 0 1px rgba(255, 105, 180, 0.36), 0 0 18px rgba(120, 255, 170, 0.55), 0 10px 28px rgba(0, 0, 0, 0.20)',
            'backdrop-filter: blur(8px)',
            '-webkit-backdrop-filter: blur(8px)',
            'pointer-events: auto'
        ].join(';');
        document.body.appendChild(progressPanel);
        return progressPanel;
    }

    function createPanelButton(id, text, background, extraStyles = {}) {
        const button = applyStyles(document.createElement('button'), {
            border: '0',
            borderRadius: '6px',
            padding: '6px 9px',
            background,
            color: '#fff',
            fontSize: '11px',
            fontWeight: '700',
            cursor: 'pointer',
            boxShadow: '0 2px 5px rgba(0, 0, 0, 0.18)',
            ...extraStyles
        });
        button.id = id;
        button.type = 'button';
        button.textContent = text;
        return button;
    }

    function createPanelLink(text, href) {
        const link = applyStyles(document.createElement('a'), {
            color: '#0f67ff',
            fontWeight: '700',
            textDecoration: 'none',
            whiteSpace: 'nowrap'
        });
        link.href = href;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = text;
        return link;
    }

    function formatCourseHoursLine(courseHours) {
        if (!courseHours) {
            return '学时：待获取';
        }

        const certifiedPart = courseHours.certifiedHours || courseHours.requiredHours
            ? ` · 认定 ${courseHours.certifiedHours || '-'} / ${courseHours.requiredHours || '-'}`
            : '';
        return `学时：已学 ${courseHours.learnedHours || '-'}${certifiedPart}`;
    }

    function updateProgressPanel() {
        if (!isTeacherTrainingCoursePage() && !isTrainingOverviewPage()) {
            return;
        }

        ensureAccountStorageHash();
        const panel = ensureProgressPanel();
        if (!panel) {
            return;
        }

        const currentCourseId = getCurrentCourseId();
        const accountLabel = getAccountLabel();
        const trainingHoursState = getTrainingHoursState();
        const panelState = JSON.stringify({
            scriptVersion,
            accountLabel,
            accountStorageHash,
            currentCourseId,
            progressMenuOpen,
            trainingHoursFetching: !!trainingHoursFetchPromise,
            progress: autoExpandCourseConfigs.map(config => getCourseProgress(config, trainingHoursState)),
            trainingHoursState
        });
        if (panelState === lastProgressPanelHtml) {
            return;
        }

        const titleRow = applyStyles(document.createElement('div'), {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
            marginBottom: '5px'
        });

        const title = applyStyles(document.createElement('div'), {
            fontSize: '13px',
            fontWeight: '700',
            color: '#263241'
        });
        title.textContent = '学习进度面板';

        const actionGroup = applyStyles(document.createElement('div'), {
            position: 'relative',
            flexShrink: '0'
        });

        const menuButton = createPanelButton('smartedu-patch-menu-button', '菜单', 'rgb(0, 123, 255)');
        menuButton.setAttribute('aria-expanded', String(progressMenuOpen));

        const menu = applyStyles(document.createElement('div'), {
            position: 'absolute',
            top: '32px',
            right: '0',
            display: progressMenuOpen ? 'grid' : 'none',
            gridTemplateColumns: '1fr',
            gap: '6px',
            minWidth: '164px',
            padding: '8px',
            borderRadius: '8px',
            border: '1px solid rgba(120, 255, 170, 0.65)',
            background: 'rgba(255, 255, 255, 0.98)',
            boxShadow: '0 10px 24px rgba(0, 0, 0, 0.18)',
            zIndex: '10007'
        });
        menu.id = 'smartedu-patch-actions-menu';
        menu.append(
            createPanelButton('smartedu-patch-account-button', '设置账号别名', 'rgb(40, 167, 69)', { textAlign: 'left' }),
            createPanelButton('smartedu-patch-refresh-hours-button', '刷新学时进度', 'rgb(0, 123, 255)', { textAlign: 'left' }),
            createPanelButton('smartedu-patch-clear-current-button', '清除当前账号进度', 'rgb(255, 107, 107)', { textAlign: 'left' }),
            createPanelButton('smartedu-patch-clear-all-button', '清除所有账号进度', 'rgb(255, 105, 180)', { textAlign: 'left' })
        );

        actionGroup.append(menuButton, menu);
        titleRow.append(title, actionGroup);

        const accountLine = applyStyles(document.createElement('div'), {
            fontSize: '11px',
            color: '#6b7280',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
        });
        accountLine.title = accountLabel;
        accountLine.textContent = `当前：${accountLabel}`;

        const fragment = document.createDocumentFragment();
        fragment.append(titleRow, accountLine);

        const hoursSummary = applyStyles(document.createElement('div'), {
            marginTop: '8px',
            padding: '8px',
            borderRadius: '8px',
            background: 'rgba(30, 98, 236, 0.08)',
            border: '1px solid rgba(30, 98, 236, 0.16)'
        });

        const totalHours = trainingHoursState.total || null;
        const summaryTitle = applyStyles(document.createElement('div'), {
            display: 'flex',
            justifyContent: 'space-between',
            gap: '8px',
            fontWeight: '700',
            color: '#263241',
            marginBottom: '5px'
        });

        const summaryLabel = document.createElement('span');
        summaryLabel.textContent = '总学时进度';
        const summaryPercent = document.createElement('span');
        summaryPercent.textContent = totalHours?.percent || (trainingHoursFetchPromise ? '更新中' : '待获取');
        summaryTitle.append(summaryLabel, summaryPercent);
        hoursSummary.appendChild(summaryTitle);

        const summaryDetail = applyStyles(document.createElement('div'), {
            display: 'grid',
            gridTemplateColumns: '1fr',
            gap: '3px',
            color: '#566170',
            fontSize: '11px'
        });
        const learnedLine = document.createElement('div');
        learnedLine.textContent = `已学习：${totalHours?.learnedHours || '-'} 学时`;
        const certifiedLine = document.createElement('div');
        certifiedLine.textContent = `已认定：${totalHours?.certifiedHours || '-'} / ${totalHours?.requiredHours || '-'} 学时${totalHours?.statusText ? ` · ${totalHours.statusText}` : ''}`;
        const sourceLine = document.createElement('a');
        sourceLine.href = trainingOverviewUrl;
        sourceLine.textContent = trainingHoursState.updatedAt
            ? `更新时间：${new Date(trainingHoursState.updatedAt).toLocaleTimeString()}`
            : '打开培训总览页';
        applyStyles(sourceLine, {
            color: '#0f67ff',
            textDecoration: 'none'
        });
        summaryDetail.append(learnedLine, certifiedLine, sourceLine);
        hoursSummary.appendChild(summaryDetail);
        fragment.appendChild(hoursSummary);

        autoExpandCourseConfigs.forEach((config, index) => {
            const progress = getCourseProgress(config, trainingHoursState);
            const courseHours = trainingHoursState.courses?.[config.courseId] || null;
            const percent = progress.total ? Math.round((progress.learned / progress.total) * 100) : 0;
            const isCurrent = config.courseId === currentCourseId;

            const row = applyStyles(document.createElement('div'), {
                marginTop: index === 0 ? '8px' : '9px',
                opacity: isCurrent ? '1' : '0.78'
            });

            const rowHeader = applyStyles(document.createElement('div'), {
                display: 'flex',
                justifyContent: 'space-between',
                gap: '8px',
                marginBottom: '4px'
            });

            const link = applyStyles(document.createElement('a'), {
                fontWeight: isCurrent ? '700' : '500',
                color: isCurrent ? '#0f67ff' : '#263241',
                textDecoration: 'none',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                pointerEvents: 'auto'
            });
            link.href = getCourseIndexUrl(config.courseId);
            link.textContent = getCourseDisplayTitle(config, index);

            const count = applyStyles(document.createElement('span'), {
                color: '#566170',
                whiteSpace: 'nowrap'
            });
            count.textContent = `视频 ${progress.learned}/${progress.total}`;
            rowHeader.append(link, count);

            const track = applyStyles(document.createElement('div'), {
                height: '5px',
                background: 'rgba(38,50,65,0.14)',
                borderRadius: '999px',
                overflow: 'hidden'
            });

            const bar = applyStyles(document.createElement('div'), {
                height: '100%',
                width: `${percent}%`,
                background: percent >= 100 ? '#22c55e' : '#0f8cff'
            });
            track.appendChild(bar);

            const hoursLine = applyStyles(document.createElement('div'), {
                marginTop: '4px',
                color: '#566170',
                fontSize: '11px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
            });
            hoursLine.textContent = formatCourseHoursLine(courseHours);

            row.append(rowHeader, track, hoursLine);
            fragment.appendChild(row);
        });

        const footer = applyStyles(document.createElement('div'), {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
            marginTop: '11px',
            paddingTop: '8px',
            borderTop: '1px solid rgba(38, 50, 65, 0.12)',
            color: '#6b7280',
            fontSize: '11px'
        });

        const authorInfo = applyStyles(document.createElement('span'), {
            minWidth: '0',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
        });
        authorInfo.textContent = `${authorName} · v${scriptVersion}`;

        const footerLinks = applyStyles(document.createElement('span'), {
            display: 'flex',
            gap: '8px',
            flexShrink: '0'
        });
        footerLinks.append(
            createPanelLink('Blog', authorBlogUrl),
            createPanelLink('GitHub', githubRepoUrl)
        );
        footer.append(authorInfo, footerLinks);
        fragment.appendChild(footer);

        panel.replaceChildren(fragment);
        lastProgressPanelHtml = panelState;
    }

    function isVisibleElement(element) {
        return !!(element.offsetParent || element.getClientRects().length);
    }

    function isActiveResourceItem(item) {
        const activeText = [
            item.className,
            item.getAttribute('aria-current'),
            item.getAttribute('aria-selected')
        ].join(' ').toLowerCase();

        return item.classList.contains('resource-item-active')
            || !!item.querySelector('.coursePlayingIcon, [class*="running"]')
            || /\b(active|selected|current|playing|checked)\b/.test(activeText)
            || item.matches('[aria-current="true"], [aria-selected="true"]');
    }

    function rememberResourceItem(resourceItem) {
        const config = getCurrentCourseConfig();
        if (!config || !resourceItem) {
            return;
        }

        const resourceItems = getConfiguredResourceItems(config);
        const index = resourceItems.indexOf(resourceItem);
        if (index < 0) {
            return;
        }

        setCurrentResourceState({
            courseId: config.courseId,
            index,
            text: getResourceItemTitle(resourceItem),
            url: location.href
        });
    }

    function rememberActiveResourceItem() {
        if (!isCourseDetailPage()) {
            return;
        }

        const config = getCurrentCourseConfig();
        if (!config) {
            return;
        }

        const activeResourceItem = getConfiguredResourceItems(config).find(isActiveResourceItem);
        if (activeResourceItem) {
            rememberResourceItem(activeResourceItem);
        }
    }

    // ===== 登录页增强 =====
    function processWeakPasswordModal() {
        const cancelBtn = document.getElementById('cancel_sdk');
        const container = document.getElementById('weak_password_container_sdk');

        if (cancelBtn && !handledModal) {
            handledModal = true;

            // 自动勾选 "7天内不再提示"
            const skipCheck = document.getElementById('skip_day_check');
            if (skipCheck && !skipCheck.checked) {
                skipCheck.checked = true;
                skipCheck.dispatchEvent(new Event('change', { bubbles: true }));
            }

            // 点击 "跳过" 按钮
            cancelBtn.click();

            // 隐藏遮罩层
            if (container) {
                container.style.display = 'none';
            }
        }
    }

    function makePasswordVisible() {
        const pwdInput = document.getElementById('tmpPassword') || document.querySelector('.my_pas_ipt');

        if (pwdInput) {
            // 将输入框类型改为 text
            if (pwdInput.type === 'password') {
                pwdInput.type = 'text';
            }

            // 解除粘贴限制
            pwdInput.removeAttribute('onpaste');
            pwdInput.removeAttribute('oncontextmenu');
            pwdInput.onpaste = null;

            // 同步睁眼/闭眼图标 UI
            const eyeClose = document.querySelector('.eyes_close');
            const eyeOpen = document.querySelector('.eyes_open');

            if (eyeClose) {
                eyeClose.style.display = 'none';
            }
            if (eyeOpen) {
                eyeOpen.style.display = 'inline';
                eyeOpen.classList.remove('dis_none');
            }
        }
    }

    function autoAgreeTerms() {
        const agreeCheck = document.getElementById('agreementCheckbox') || document.querySelector('.agre_check');
        if (agreeCheck && !agreeCheck.checked) {
            agreeCheck.checked = true;
            // 触发 change 和 click 事件，确保页面 UI 与绑定的校验逻辑生效
            agreeCheck.dispatchEvent(new Event('change', { bubbles: true }));
            agreeCheck.dispatchEvent(new Event('click', { bubbles: true }));
        }
    }

    // ===== 课程页自动化 =====
    function autoExpandCourseSections() {
        if (!isTeacherTrainingCoursePage()) {
            return;
        }

        const config = getCurrentCourseConfig();
        if (!config) {
            return;
        }

        const targetTitles = config.sectionTitles.map(normalizeText);
        const headers = document.querySelectorAll('.fish-collapse-header[role="button"], .fish-collapse-header');

        headers.forEach(header => {
            const headerText = normalizeText(header.textContent);
            const titleMatched = targetTitles.some(title => headerText === title || headerText.endsWith(title));
            if (!titleMatched) {
                return;
            }

            const collapseItem = header.closest('.fish-collapse-item');
            const isExpanded = header.getAttribute('aria-expanded') === 'true'
                || collapseItem?.classList.contains('fish-collapse-item-active');

            if (!isExpanded) {
                header.click();
            }
        });
    }

    // 只高亮白名单视频，方便核对脚本即将学习的资源范围。
    function ensureResourceHighlightStyle() {
        if (document.getElementById(resourceHighlightStyleId) || !document.head) {
            return;
        }

        const style = document.createElement('style');
        style.id = resourceHighlightStyleId;
        style.textContent = `
            @keyframes smarteduPatchWhitelistPulse {
                0%, 100% {
                    box-shadow: inset 4px 0 0 #0f8cff, 0 0 0 rgba(15, 140, 255, 0);
                }
                50% {
                    box-shadow: inset 4px 0 0 #0f8cff, 0 0 14px rgba(15, 140, 255, 0.28);
                }
            }
            .smartedu-patch-resource-highlight {
                position: relative;
                border-radius: 8px !important;
                background: linear-gradient(90deg, rgba(15, 140, 255, 0.15), rgba(120, 255, 170, 0.08)) !important;
                animation: smarteduPatchWhitelistPulse 1.8s ease-in-out infinite;
            }
            .smartedu-patch-resource-highlight-name {
                color: #0f67ff !important;
                font-weight: 800 !important;
                text-shadow: 0 0 8px rgba(15, 140, 255, 0.18);
            }
        `;
        document.head.appendChild(style);
    }

    function highlightWhitelistedResources() {
        if (!isTeacherTrainingCoursePage()) {
            return;
        }

        const config = getCurrentCourseConfig();
        if (!config) {
            return;
        }

        ensureResourceHighlightStyle();
        getConfiguredResourceItems(config).forEach(resourceItem => {
            resourceItem.classList.add('smartedu-patch-resource-highlight');
            const titleElement = resourceItem.children?.[0];
            if (titleElement) {
                titleElement.classList.add('smartedu-patch-resource-highlight-name');
            }
        });
    }

    // 点击 hydrachs 脚本的“准备刷课”后，等待它读取课程列表，再刷新并进入首个白名单视频。
    function handlePrepareStudyClick(event) {
        const button = getButtonFromEventTarget(event.target);
        if (!button || !normalizeText(button.textContent).includes('准备刷课')) {
            return;
        }

        const config = getCurrentCourseConfig();
        if (!config || prepareStudyRefreshTimer) {
            return;
        }

        setPrepareStudyState({
            courseId: config.courseId,
            phase: 'waitingReload',
            reloadUrl: location.href
        });

        prepareStudyRefreshTimer = setTimeout(() => {
            setPrepareStudyState({
                courseId: config.courseId,
                phase: 'enterAfterReload',
                reloadUrl: location.href
            });

            location.reload();
        }, prepareStudyDelayMs);
    }

    function autoEnterLearningVideoAfterReload() {
        if (enteredVideoAfterReload) {
            return;
        }

        const state = getPrepareStudyState();
        const config = state ? getCourseConfigById(state.courseId) : null;
        if (!state || !config || getCurrentCourseId() !== state.courseId) {
            return;
        }

        if (Date.now() - state.createdAt > 120000) {
            clearPrepareStudyState();
            return;
        }

        if (state.phase !== 'enterAfterReload') {
            return;
        }

        const resourceItems = getConfiguredResourceItems(config);
        const targetResource = resourceItems.find(isVisibleElement) || resourceItems[0];

        if (!targetResource) {
            return;
        }

        enteredVideoAfterReload = true;
        clearPrepareStudyState();
        rememberResourceItem(targetResource);
        targetResource.click();
    }

    function goToNextCourse(config, currentVideoKey) {
        const nextCourseConfig = getNextCourseConfig(config.courseId);
        if (!nextCourseConfig) {
            return false;
        }

        autoNextVideoTriggered = true;
        lastAutoNextVideoKey = currentVideoKey;
        syncTrainingHours(true);
        setTimeout(() => {
            location.href = getCourseIndexUrl(nextCourseConfig.courseId);
        }, autoNextVideoClickDelayMs);
        return true;
    }

    // 播放完成出现“再学一遍”时，优先切换下一个未学白名单视频；本专题达标后跳下一个专题。
    function autoSwitchToNextVideoAfterFinished() {
        if (!isCourseDetailPage() || autoNextVideoTriggered) {
            return;
        }

        const replayButton = Array.from(document.querySelectorAll('.course-video-reload'))
            .find(button => normalizeText(button.textContent).includes('再学一遍') && isVisibleElement(button));
        if (!replayButton) {
            return;
        }

        const config = getCurrentCourseConfig();
        if (!config) {
            return;
        }

        const resourceItems = getConfiguredResourceItems(config);
        if (!resourceItems.length) {
            return;
        }

        const state = getCurrentResourceState();
        let currentIndex = resourceItems.findIndex(isActiveResourceItem);

        if (currentIndex < 0 && state && state.courseId === config.courseId) {
            const storedTextIndex = resourceItems.findIndex(item => getResourceItemTitle(item) === state.text);
            currentIndex = storedTextIndex >= 0 ? storedTextIndex : Number(state.index);
        }

        if (currentIndex < 0) {
            return;
        }

        const currentVideoKey = `${config.courseId}:${currentIndex}:${location.href}`;
        if (lastAutoNextVideoKey === currentVideoKey) {
            return;
        }

        const progress = getCourseProgress(config);
        if (progress.total > 0 && progress.learned >= progress.total) {
            goToNextCourse(config, currentVideoKey);
            return;
        }

        const nextResource = resourceItems
            .slice(currentIndex + 1)
            .find(resourceItem => !isLearnedResourceItem(resourceItem))
            || resourceItems[currentIndex + 1];
        if (!nextResource) {
            goToNextCourse(config, currentVideoKey);
            return;
        }

        autoNextVideoTriggered = true;
        lastAutoNextVideoKey = currentVideoKey;
        rememberResourceItem(nextResource);
        setTimeout(() => {
            nextResource.click();
        }, autoNextVideoClickDelayMs);
        setTimeout(() => {
            autoNextVideoTriggered = false;
        }, autoNextVideoCooldownMs);
    }

    // ===== 用户交互事件 =====
    function handleResourceItemClick(event) {
        const resourceItem = event.target?.closest?.('.resource-item');
        if (!resourceItem) {
            return;
        }

        rememberResourceItem(resourceItem);
    }

    function handlePanelActionClick(event) {
        const menuButton = event.target?.closest?.('#smartedu-patch-menu-button');
        const accountButton = event.target?.closest?.('#smartedu-patch-account-button');
        const refreshHoursButton = event.target?.closest?.('#smartedu-patch-refresh-hours-button');
        const clearCurrentButton = event.target?.closest?.('#smartedu-patch-clear-current-button');
        const clearAllButton = event.target?.closest?.('#smartedu-patch-clear-all-button');
        if (!menuButton && !accountButton && !refreshHoursButton && !clearCurrentButton && !clearAllButton) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();

        if (menuButton) {
            progressMenuOpen = !progressMenuOpen;
            lastProgressPanelHtml = '';
            updateProgressPanel();
            return;
        }

        progressMenuOpen = false;
        lastProgressPanelHtml = '';

        if (accountButton) {
            const currentAccountLabel = getAccountLabel();
            const input = prompt('请输入当前账号别名。建议使用自己能识别的别名，不要输入真实姓名或密码；留空则恢复自动识别。', currentAccountLabel === '默认账号' ? '' : currentAccountLabel);
            if (input === null) {
                return;
            }

            setManualAccountLabel(input);
            updateProgressPanel();
            return;
        }

        if (refreshHoursButton) {
            syncTrainingHours(true);
            updateProgressPanel();
            return;
        }

        if (clearCurrentButton && confirm('确定清除当前账号的本地学习进度吗？')) {
            clearCurrentAccountProgress();
            return;
        }

        if (clearAllButton && confirm('确定清除所有账号的本地学习进度吗？')) {
            clearAllAccountProgress();
        }
    }

    // ===== 调度入口 =====
    // 页面是 React 动态渲染，MutationObserver + 短轮询一起兜底最稳。
    function handleAll() {
        processWeakPasswordModal();
        makePasswordVisible();
        autoAgreeTerms();
        autoExpandCourseSections();
        highlightWhitelistedResources();
        syncCurrentCourseProgress();
        syncTrainingHours();
        updateProgressPanel();
        rememberActiveResourceItem();
        autoEnterLearningVideoAfterReload();
        autoSwitchToNextVideoAfterFinished();
    }

    const observer = new MutationObserver(() => {
        handleAll();
    });

    if (document.body || document.documentElement) {
        observer.observe(document.body || document.documentElement, {
            childList: true,
            subtree: true
        });
    }

    const timer = setInterval(() => {
        handleAll();
    }, 100);

    document.addEventListener('click', handlePrepareStudyClick, true);
    document.addEventListener('click', handleResourceItemClick, true);
    document.addEventListener('click', handlePanelActionClick, true);
})();
