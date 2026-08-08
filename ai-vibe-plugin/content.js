const thinkingGif = chrome.runtime.getURL("thinking.gif");
const outputtingGif = chrome.runtime.getURL("outputting.gif");
const idleGif = chrome.runtime.getURL("idle.gif");
const completedGif = chrome.runtime.getURL("completed.gif");

let gifContainer = null;
let currentState = "none";
let transitionTimer = null;
let completedTimer = null;

// 状态机变量
let lastTextLength = 0;
let lastCheckTime = Date.now();
let busyStartTime = 0;
let isBusyPrevious = false;

// 稳定性缓冲变量
let lastOutputTime = 0;         // 上一次处于输出状态的时间戳（解决代码块挂起）
let isCompletedLocked = false;   // 完成状态强锁定标记（解决 completed 被冲掉）

function initUI() {
    gifContainer = document.createElement("img");
    gifContainer.style.cssText = "position:fixed; bottom:30px; right:30px; z-index:9999; width:80px;";
    document.body.appendChild(gifContainer);
}

function switchState(newState) {
    if (currentState === newState) return;

    clearTimeout(transitionTimer);
    transitionTimer = setTimeout(() => {
        currentState = newState;
        if (newState === "thinking") {
            gifContainer.src = thinkingGif;
        } else if (newState === "outputting") {
            gifContainer.src = outputtingGif;
        } else if (newState === "completed") {
            gifContainer.src = completedGif;
        } else {
            gifContainer.src = idleGif;
        }
    }, 100);
}

function checkDOM() {
    // 保护规则 0：如果处于 completed 锁定期间，阻断一切 DOM 检查
    if (isCompletedLocked) return;

    // 1. 判定 Stop 按钮（Busy 状态）
    const stopButtonSelectors = [
        'button[aria-label*="Stop"]',
        'button[aria-label*="停止"]',
        'button[aria-label*="中断"]',
        'button[title*="Stop"]',
        'button[title*="停止"]',
        'button[data-testid*="stop"]',
        'button .mat-icon[aria-label*="stop"]',
        '.stop-button'
    ];

    const isBusyNow = stopButtonSelectors.some(selector => document.querySelector(selector) !== null);

    // 2. 捕获【刚发送问题进入 Busy】的瞬间
    if (isBusyNow && !isBusyPrevious) {
        busyStartTime = Date.now();
        lastTextLength = document.body.textContent.length;
        isBusyPrevious = true;
        lastOutputTime = 0;
        switchState("thinking");
        return;
    }

    // 3. 核心修复：捕获【从 Busy 结束切换到非 Busy】的完成瞬间
    if (!isBusyNow && isBusyPrevious) {
        isBusyPrevious = false;
        lastTextLength = 0;
        lastOutputTime = 0;
        
        // 开启完成状态强锁定
        isCompletedLocked = true;
        switchState("completed");

        clearTimeout(completedTimer);
        completedTimer = setTimeout(() => {
            // 3000ms（3秒）播放结束后解除锁定，回归待机
            isCompletedLocked = false;
            switchState("idle");
        }, 3000);

        return;
    }

    // 4. 普通非 Busy 状态
    if (!isBusyNow) {
        isBusyPrevious = false;
        lastTextLength = 0;
        switchState("idle");
        return;
    }

    // 5. 处于 Busy 状态下的精准分流
    const now = Date.now();
    
    // 1000ms 冰冻保护期，规避提问渲染干扰
    if (now - busyStartTime < 1000) {
        switchState("thinking");
        lastTextLength = document.body.textContent.length;
        return;
    }

    // 字数监测与惯性维持
    if (now - lastCheckTime > 150) {
        const currentLength = document.body.textContent.length;
        const diff = currentLength - lastTextLength;

        if (diff > 2) {
            // 只要有字数暴增，记录上一次输出的时间戳
            lastOutputTime = now;
        }

        lastTextLength = currentLength;
        lastCheckTime = now;
    }

    // 核心修复：即使当前 150ms 内增量为 0（如渲染代码块），
    // 只要距离上一次输出时间不足 600ms，依然强制保持在 outputting 状态！
    if (now - lastOutputTime < 600) {
        switchState("outputting");
    } else {
        switchState("thinking");
    }
}

// 节流监听
let isChecking = false;
const observer = new MutationObserver(() => {
    if (!isChecking) {
        isChecking = true;
        requestAnimationFrame(() => {
            checkDOM();
            isChecking = false;
        });
    }
});

// 启动
initUI();
checkDOM();
observer.observe(document.body, { childList: true, subtree: true });