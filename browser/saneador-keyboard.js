// Carregado novamente a cada comando para acompanhar o worker lido do disco.
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function driveInput(win, frame, input, check = () => {}) {
    check();
    if (!['mention', 'select', 'send'].includes(input.action)) throw new Error('Comando de entrada inválido.');
    win.show(); win.focus(); win.webContents.focus();
    await frame.executeJavaScript(`(() => { const el = document.querySelector('#m365-chat-editor-target-element, [contenteditable="true"][role="textbox"], textarea'); if (!el) throw new Error('Editor não encontrado para teclado.'); el.focus(); true; })()`);
    const key = (keyCode, modifiers = []) => { win.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers }); win.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers }); };
    if (input.action === 'send') { check(); key('Enter'); return; }
    if (input.action === 'mention') {
        check();
        if (!/^@[\p{L}\p{N} _-]{1,100}$/u.test(input.text)) throw new Error('Menção inválida.');
        key('A', ['control']); key('Backspace'); await pause(600);
        // O caractere isolado não descreve a tecla física nem o Shift do @.
        // Envia ambos pelo Chromium, incluindo key/code e código virtual Windows.
        const keyboard = win.webContents.debugger;
        const owned = !keyboard.isAttached();
        if (owned) keyboard.attach('1.3');
        try {
            for (const [index, character] of [...input.text].entries()) {
                check();
                const at = character === '@';
                const letter = /^[a-z]$/i.test(character);
                const event = { key: character, code: at ? 'Digit2' : letter ? 'Key' + character.toUpperCase() : character === ' ' ? 'Space' : '', windowsVirtualKeyCode: at ? 50 : character.toUpperCase().charCodeAt(0), modifiers: at ? 8 : 0 };
                await keyboard.sendCommand('Input.dispatchKeyEvent', { ...event, type: 'rawKeyDown' });
                await pause(20);
                await keyboard.sendCommand('Input.dispatchKeyEvent', { ...event, type: 'char', text: character, unmodifiedText: at ? '2' : character });
                await pause(20);
                await keyboard.sendCommand('Input.dispatchKeyEvent', { ...event, type: 'keyUp' });
                if (index < input.text.length - 1) await pause(at ? 450 : 100);
            }
        } finally { if (owned && keyboard.isAttached()) keyboard.detach(); }
    }
    // Dá tempo ao autocomplete antes de navegar, sem exigir confirmação DOM.
    await pause(1800);
    check();
    {
        await frame.executeJavaScript(`(() => {
            window.__spCopilotKeyTrace = [];
            if (!window.__spCopilotKeyTraceInstalled) {
                window.__spCopilotKeyTraceInstalled = true;
                for (const type of ['keydown', 'keyup']) document.addEventListener(type, event => {
                    if (!['Tab', 'Enter'].includes(event.key)) return;
                    const editor = document.querySelector('#m365-chat-editor-target-element, [contenteditable="true"][role="textbox"], textarea');
                    window.__spCopilotKeyTrace.push({ type, key: event.key, code: event.code, keyCode: event.keyCode, trusted: event.isTrusted, inEditor: !!editor && (editor === event.target || editor.contains(event.target)) });
                }, true);
            }
            true;
        })()`);
        const keyboard = win.webContents.debugger;
        const owned = !keyboard.isAttached();
        if (owned) keyboard.attach('1.3');
        try {
            const tab = { key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 };
            for (const event of [tab, tab, tab, tab, { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 }]) {
                check();
                await keyboard.sendCommand('Input.dispatchKeyEvent', { ...event, type: 'keyDown', modifiers: 0, autoRepeat: false, isSystemKey: false });
                await pause(50);
                await keyboard.sendCommand('Input.dispatchKeyEvent', { ...event, type: 'keyUp' });
                if (event.key === 'Tab') await pause(350);
            }
        } finally { if (owned && keyboard.isAttached()) keyboard.detach(); }
        const delivered = await frame.executeJavaScript(`window.__spCopilotKeyTrace || []`).catch(() => []);
        // O trace serve apenas ao diagnóstico; não condiciona a sequência.
        await frame.executeJavaScript(`window.__spCopilotKeyboardDiagnostic = ${JSON.stringify({ events: delivered, at: Date.now() })}; true`).catch(() => {});
    }
}
module.exports = { driveInput };
