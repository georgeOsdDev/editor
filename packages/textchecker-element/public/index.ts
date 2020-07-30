import { TextCheckerElement, TextCheckerElementRectItem, TextCheckerCard, TextCheckerPopupElement } from "../src/index";
import type { TextlintResult, TextlintFixResult } from "@textlint/types";

const updateStatus = (status: string) => {
    document.querySelector("#js-status").textContent = status;
};
const attachTextChecker = (targetElement: HTMLTextAreaElement) => {
    const textChecker = new TextCheckerElement({
        targetElement: targetElement,
        hoverPadding: 4
    });
    const textCheckerPopup = new TextCheckerPopupElement();
    targetElement.before(textChecker);
    document.body.append(textCheckerPopup);
    let count = 0;

    function debounce(fn: () => void, delay: number) {
        let timeoutId = null;
        return function (...args: any[]) {
            clearTimeout(timeoutId);
            var that = this;
            timeoutId = setTimeout(function () {
                fn.apply(that, args);
            }, delay);
        };
    }

    const worker = new Worker("textlint.js");
    const waiterForInit = () => {
        let initialized = false;
        let _resolve: null | ((init: boolean) => void) = null;
        const deferred = new Promise((resolve) => {
            _resolve = resolve;
        });
        worker.addEventListener(
            "message",
            function (event) {
                if (event.data.command === "init") {
                    initialized = true;
                    _resolve(initialized);
                }
            },
            {
                once: true
            }
        );
        return {
            ready() {
                return deferred;
            }
        };
    };
    const workerStatus = waiterForInit();
    const lintText = async (message: string): Promise<TextlintResult> => {
        await workerStatus.ready();
        return new Promise((resolve, _reject) => {
            worker.addEventListener(
                "message",
                function (event) {
                    if (event.data.command === "lint:result") {
                        resolve(event.data.result);
                    }
                },
                {
                    once: true
                }
            );
            return worker.postMessage({
                command: "lint",
                text: message,
                ext: ".md"
            });
        });
    };
    const fixText = async (message: string, ruleId: string): Promise<TextlintFixResult> => {
        await workerStatus.ready();
        return new Promise((resolve, _reject) => {
            worker.addEventListener(
                "message",
                function (event) {
                    if (event.data.command === "fix:result") {
                        resolve(event.data.result);
                    }
                },
                {
                    once: true
                }
            );
            return worker.postMessage({
                command: "fix",
                text: message,
                ruleId,
                ext: ".md"
            });
        });
    };

    let onComposition = false;
    const compositionStart = () => {
        onComposition = true;
    };
    const compositionEnd = () => {
        onComposition = false;
    };

    const update = debounce(async () => {
        // stop lint on IME composition
        if (onComposition) {
            return;
        }
        console.time("lint");
        updateStatus("linting...");
        const result = await lintText(targetElement.value);
        updateStatus("linted");
        const annotations = result.messages.map((message) => {
            const card: TextCheckerCard = {
                id: message.ruleId + "::" + message.index,
                message: message.message,
                fixable: Boolean(message.fix)
            };
            return {
                start: message.index,
                end: message.index + 1,
                onMouseEnter: ({ rectItem }: { rectItem: TextCheckerElementRectItem }) => {
                    textCheckerPopup.updateCard({
                        card: card,
                        rect: {
                            top:
                                rectItem.boxBorderWidth +
                                rectItem.boxMarginTop +
                                rectItem.boxPaddingTop +
                                rectItem.boxAbsoluteY +
                                rectItem.top +
                                rectItem.height,
                            left: rectItem.boxAbsoluteX + rectItem.left,
                            width: rectItem.width
                        },
                        handlers: {
                            async onFixIt() {
                                console.log("onFixIt");
                                const currentText = targetElement.value;
                                const fixResult = await fixText(currentText, message.ruleId);
                                console.log(currentText, "!==", fixResult.output);
                                if (currentText === targetElement.value && currentText !== fixResult.output) {
                                    targetElement.value = fixResult.output;
                                    update();
                                    textCheckerPopup.dismissCard(card);
                                }
                                console.log("fixResult", fixResult);
                            },
                            onIgnore() {
                                console.log("onIgnore");
                            },
                            onSeeDocument() {
                                console.log("onSeeDocument");
                            }
                        }
                    });
                },
                onMouseLeave() {
                    textCheckerPopup.dismissCard(card);
                }
            };
        });
        textChecker.updateAnnotations(annotations);
    }, 200);
    targetElement.addEventListener("compositionstart", compositionStart);
    targetElement.addEventListener("compositionend", compositionEnd);
    targetElement.addEventListener("input", update);
    update();
};

const targetElement = document.querySelectorAll("textarea");
targetElement.forEach((element) => attachTextChecker(element));
