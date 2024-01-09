// Tree Explorer //

const randomColors = [
    '#911eb4'
    , '#4363d8'
    , '#e6194b'
    , '#3cb44b'
    , '#ffe119'
    , '#f58231'
    , '#46f0f0'
    , '#f032e6'
    , '#bcf60c'
    , '#fabebe'
    , '#008080'
    , '#e6beff'
    , '#9a6324'
    , '#800000'
    , '#aaffc3'
    , '#808000'
    , '#000075'
    , '#808080'
    , '#000000'
    , '#fffac8'
    , '#ffd8b1'
];

const defaultZoom = () => +(Math.min(window.innerHeight, window.innerWidth) / 500).toFixed(2);
const defaultPanX = () => 0;
const defaultPanY = () => 0;
const zoomMultiplier = 0.25;
const fontFamily = 'Tahoma';
const innerRingSizeModifier = 0.4;
const localStorageKeyPrefix = 'te_tree_';
const localStorageLastSelectedKey = 'te_lastselected';
const validSizeModifier = 200;
const validSizes = { '1': 0.5, '2': 0.75, '3': 1 };

const items = [];
const history = [];
let zoom = null;
let panX = null;
let panY = null;
let centerX = window.innerWidth / 2;
let centerY = window.innerHeight / 2;

let draggingTarget = null;
let currentlyHoveringOn = [];
let currentlyPanning = false;
let lastDragInformation = { dragActive: false };
let itemSizePositionCache = {};
let itemOrderCache = [];
let textModificationDialogParent = null;
let textModificationDialogTextArea = null;
let textModificationOpen = false;

const borderSize = s => Math.max(1, Math.floor(Math.sqrt(s) / 2));

let tabBar = null;
let canvas = null;
let context = null;

const resetCameraLocation = () =>
{
    zoom = defaultZoom();
    panX = defaultPanX();
    panY = defaultPanY();
}

const distanceBetween = (x1, y1, x2, y2) =>
    Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));

const resetItemOrderCache = () => {
    itemOrderCache.splice(0);
    const addChildren = (parentId) => {
        const chIds = items.filter(it => it.parentId == parentId).map(({
            id
        }) => id);
        itemOrderCache.unshift(...chIds);
        chIds.forEach(addChildren);
    }

    // Start with root and work through children
    const cur = items.find(({
        parentId
    }) => !parentId);
    itemOrderCache.unshift(cur.id);
    addChildren(cur.id);
}

const lightenColor = (color, percent) => {
    const num = parseInt(color.replace('#', ''), 16);
    let r = (num >> 16) + percent;
    let g = ((num >> 8) & 0x00FF) + percent;
    let b = (num & 0x0000FF) + percent;
    r = (r < 255 ? (r < 1 ? 0 : r) : 255);
    g = (g < 255 ? (g < 1 ? 0 : g) : 255);
    b = (b < 255 ? (b < 1 ? 0 : b) : 255);
    return `#${(r << 16 | g << 8 | b).toString(16).padStart(6, '0')}`;
}

const clearCacheForItem = (id) => {
    const item = withSizeAndPosition({
        id
    });
    if(item) {
        for(const childId of item.children) {
            clearCacheForItem(childId);
        }
    }
    delete itemSizePositionCache[id];
}

const withSizeAndPosition = (item) => {
    if(!item) {
        return item;
    }
    if(!itemSizePositionCache[item.id]) {
        item = items.find(it => it.id == item.id); // incase only {id} is fed in.
        if(!item) {
            return item;
        }
        let x, y, baseSizePx, sizePx, innerRingSizePx, borderWidth, siblingCount = 0,
            restrictVisibility = 0;
        let children = items.filter(it => it.parentId === item.id).map(it => it.id);
        const parent = item.parentId ? withSizeAndPosition({
            id: item.parentId
        }) : null;
        const parentId = item.parentId;
        if(!parent) {
            x = panX + centerX;
            y = panY + centerY;
            baseSizePx = Math.max(0, validSizeModifier * zoom);
        } else {
            const childCount = parent.children.length;
            const childPos = parent.children.findIndex(id => id === item.id);
            const angle = (
                (
                    childCount == 2 ? Math.PI :
                    -(Math.PI / 2)
                ) +
                (
                    ((2 * Math.PI) / (childCount)) *
                    (childPos)
                )
            );

            x = (Math.cos(angle) * parent.innerRingSizePx) + parent.x;
            y = (Math.sin(angle) * parent.innerRingSizePx) + parent.y;
            siblingCount = parent.children.length;
            baseSizePx = (
                (parent.sizePx * 0.55 * Math.sqrt(siblingCount)) *
                (1 / siblingCount)
            );
        }
        restrictVisibility = parent && parent.sizePx < 50 ? true : false;
        restrictInteractivity = parent && parent.sizePx < 200 ? true : false;
        sizePx = baseSizePx * validSizes[item.sizeIndicator];
        borderWidth = borderSize(sizePx);
        innerRingSizePx = (
            sizePx *
            innerRingSizeModifier *
            (
                children.length < 2 ?
                0 :
                Math.sqrt(Math.sqrt(children.length))
            )
        );

        itemSizePositionCache[item.id] = {
            parentId,
            x,
            y,
            sizePx,
            baseSizePx,
            innerRingSizePx,
            children,
            borderWidth,
            restrictVisibility,
            restrictInteractivity,
            siblingCount
        };
        itemSizePositionCache[item.id].buttonDimensions = calculateButtonDimensions(itemSizePositionCache[item.id]);
    }
    return {
        ...item,
        ...itemSizePositionCache[item.id]
    };
};

const calculateButtonDimensions = (item) => {
    const v = {};

    v.x = item.x;
    v.sizePx = Math.max(2, item.sizePx / 3) * (2 / 5);

    if(item.children.length <= 2) {
        // plus goes underneath
        v.y = item.y - (item.sizePx * 0.75);
    } else {
        // plus goes in center
        v.y = item.y;
    }

    v.lineWidth = Math.max(2, v.sizePx / 15);
    v.color = '#e0e0e0';

    const fullButtonSizePx = (v.sizePx * 1.4);
    const halfButtonSizePx = fullButtonSizePx / 2;
    const buttonSpacing = (v.sizePx * 0.7)
    const halfButtonSpacing = buttonSpacing / 2;

    v.buttons = [];

    if(item.parentId) {
        v.buttons.push({
            type: 'remove',
            x: v.x - (fullButtonSizePx + buttonSpacing),
            y: v.y,
            xStart: v.x - (halfButtonSizePx + buttonSpacing + fullButtonSizePx),
            yStart: v.y - halfButtonSizePx,
            xEnd: v.x - (halfButtonSizePx + buttonSpacing),
            yEnd: v.y + halfButtonSizePx
        });

        v.buttons.push({
            type: 'modifyText',
            x: v.x,
            y: v.y,
            xStart: v.x - halfButtonSizePx,
            yStart: v.y - halfButtonSizePx,
            xEnd: v.x + halfButtonSizePx,
            yEnd: v.y + halfButtonSizePx
        });

        v.buttons.push({
            type: 'add',
            x: v.x + (fullButtonSizePx + buttonSpacing),
            y: v.y,
            xStart: v.x + (halfButtonSizePx + buttonSpacing),
            yStart: v.y - halfButtonSizePx,
            xEnd: v.x + (halfButtonSizePx + buttonSpacing + fullButtonSizePx),
            yEnd: v.y + halfButtonSizePx
        });
    } else {

        v.buttons.push({
            type: 'modifyText',
            x: v.x - halfButtonSizePx - halfButtonSpacing,
            y: v.y,
            xStart: v.x - fullButtonSizePx - halfButtonSpacing,
            yStart: v.y - halfButtonSizePx,
            xEnd: v.x - halfButtonSpacing,
            yEnd: v.y + halfButtonSizePx
        });

        v.buttons.push({
            type: 'add',
            x: v.x + halfButtonSizePx + halfButtonSpacing,
            y: v.y,
            xStart: v.x + halfButtonSpacing,
            yStart: v.y - halfButtonSizePx,
            xEnd: v.x + fullButtonSizePx + halfButtonSpacing,
            yEnd: v.y + halfButtonSizePx
        });
    }


    return v;
}

// Function to set canvas width and height to window innerWidth and innerHeight
const resizeCanvas = () => {
    centerX = window.innerWidth / 2;
    centerY = window.innerHeight / 2;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    reDraw(true);
};

const reDraw = (resetCache = false) => {
    if(resetCache) {
        itemSizePositionCache = {};
    }
    context.clearRect(0, 0, canvas.width, canvas.height);
    const opts = items.map((it, i) => {
        const randomColor = randomColors[i % randomColors.length];
        const color = (
            it.id === draggingTarget || currentlyHoveringOn.includes(it.id) ? 
            lightenColor(randomColor, 30) : 
            randomColor
        );
        return ({ ...withSizeAndPosition(it), text: it.text, color });
    });

    opts.forEach(drawNode);
}

const drawNode = (opts) => {
    const circleOpacity = opts.children.length ? 1 : 0.2;

    if(!opts.restrictVisibility) {
        // conditionally render additional circle border/ring
        drawCircle({
            ...opts,
            color: '#eee',
            opacity: circleOpacity,
            borderWidth: opts.borderWidth + 4
        });
    }
    drawCircle({
        ...opts,
        opacity: circleOpacity
    });
    drawNodeText(opts);
    if(!opts.restrictInteractivity && currentlyHoveringOn[0] === opts.id) {
        for(const b of opts.buttonDimensions.buttons) {
            if(b.type === 'remove') {
                drawRemove({
                    ...opts.buttonDimensions,
                    ...b
                });
            } else if(b.type === 'modifyText') {
                drawModifyText({
                    ...opts.buttonDimensions,
                    ...b
                });
            } else if(b.type === 'add') {
                drawPlus({
                    ...opts.buttonDimensions,
                    ...b
                });
            }
        }
    }
    //drawCircle({ ...opts, color: '#f4f4f4', sizePx: opts.innerRingSizePx, dashPattern: [20,10] })
}

const drawPlus = ({
    x,
    y,
    xStart,
    sizePx,
    xEnd,
    yStart,
    yEnd,
    color,
    lineWidth = 1
}) => {
    drawCircle({
        x,
        y,
        sizePx,
        color,
        fillColor: '#fff',
        borderWidth: lineWidth / 2
    })
    context.strokeStyle = color;
    context.lineWidth = lineWidth;
    context.beginPath();
    context.moveTo(x, yStart);
    context.lineTo(x, yEnd);
    context.stroke();
    context.beginPath();
    context.moveTo(xStart, y);
    context.lineTo(xEnd, y);
    context.stroke();
}

const drawModifyText = ({
    x,
    y,
    sizePx,
    color,
    lineWidth = 1
}) => {
    drawCircle({
        x,
        y,
        sizePx,
        color,
        fillColor: '#fff',
        borderWidth: lineWidth / 2
    });

    context.beginPath();
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillStyle = color;
    context.font = `${sizePx * 1.4}px ${fontFamily}`;
    // context.lineWidth = 5;
    // context.strokeStyle = '#eee';
    // context.strokeText("Tt", x, y);
    context.fillText("Tt", x, y + (sizePx * 0.1));

}

const drawRemove = ({
    x,
    y,
    xStart,
    sizePx,
    xEnd,
    yStart,
    yEnd,
    color,
    lineWidth = 1
}) => {
    drawCircle({
        x,
        y,
        sizePx,
        color,
        fillColor: '#fff',
        borderWidth: lineWidth / 2
    })
    context.strokeStyle = color;
    context.lineWidth = lineWidth;
    const bufferSpace = sizePx * 0.1;
    context.beginPath();
    context.moveTo(xStart + bufferSpace, yStart + bufferSpace);
    context.lineTo(xEnd - bufferSpace, yEnd - bufferSpace);
    context.stroke();
    context.beginPath();
    context.moveTo(xStart + bufferSpace, yEnd - bufferSpace);
    context.lineTo(xEnd - bufferSpace, yStart + bufferSpace);
    context.stroke();
}

const drawCircle = ({
    x,
    y,
    sizePx,
    color,
    fillColor,
    borderWidth,
    opacity = 1,
    dashPattern = []
}) => {
    context.globalAlpha = opacity;
    context.beginPath();
    if(dashPattern.length > 0) {
        context.setLineDash(dashPattern);
    }
    context.arc(x, y, sizePx, 0, Math.PI * 2);
    if(fillColor) {
        context.fillStyle = fillColor;
        context.fill();
    }
    context.lineWidth = borderWidth;
    context.strokeStyle = color;
    context.stroke();
    context.globalAlpha = 1;
}

const drawNodeText = ({
    text,
    x,
    y,
    restrictVisibility,
    sizePx,
    children
}) => {
    if(restrictVisibility) {
        if(sizePx < 3) {
            return;
        } else {
            //text = '...';
        }
    }
    context.beginPath();
    context.textAlign = "center";
    context.textBaseline = "bottom";
    context.fillStyle = '#000';

    if(
        (sizePx < 20 && text.length > 10) ||
        sizePx < 10
    ) {
        text = '...';
    }

    let maxSizePx = 0;
    let isStrokeText = false;

    const textOpts = {
        font: fontFamily,
        debug: false
    };

    context.font = `1px ${textOpts.font}`; // Required for future measureText() calls.
    if(children.length) {
        // Always goes above
        if(text.length <= 40) {
            // stroked text is preferable for titles, but not mandatory if there is significant text.
            isStrokeText = true;
            textOpts.x = x;
            textOpts.y = Math.floor(y - (sizePx * 0.98));
        } else {
            maxSizePx = sizePx * 0.25;
            textOpts.x = x - (sizePx * 1.25);
            textOpts.y = Math.floor(y - (sizePx + maxSizePx));
            textOpts.width = sizePx * 2.5;
            textOpts.height = maxSizePx;
        }
        textOpts.fontSize = Math.max(10, Math.floor(sizePx / context.measureText(text).width / 2)).toFixed(0);
    } else {
        maxSizePx = sizePx * 1.5;
        textOpts.x = x - sizePx;
        textOpts.y = y - sizePx;
        textOpts.width = sizePx * 2;
        textOpts.height = sizePx * 2;
        textOpts.fontSize = Math.max(10, Math.floor(sizePx / context.measureText(text).width)).toFixed(0);
    }

    if(isStrokeText) {
        context.font = `${textOpts.fontSize}px ${textOpts.font}`;
        context.lineWidth = 3;
        context.strokeStyle = '#fff';
        context.strokeText(text, textOpts.x, textOpts.y);
        context.fillText(text, textOpts.x, textOpts.y);
    } else {
        if(text.length > 20) {
            // Perform an extra invisible run first if there is more text, as text length likely needs to be culled

            const existingAlpha = context.globalAlpha;
            context.globalAlpha = 0;

            const {
                height: heightOut
            } = window.canvasTxt.drawText(context, text, textOpts);

            context.globalAlpha = existingAlpha;

            const heightRatio = maxSizePx / heightOut;

            if(heightRatio < 1) {
                text = text.slice(0, Math.floor(text.length * heightRatio)) + "..."
            }
        }

        window.canvasTxt.drawText(context, text, textOpts);
    }

}

const randomString = () => Math.random().toString().slice(2, 8);
const flatDate = () => new Date().toISOString().slice(0, -1).replace(/[T:\.-]/gim, '');
const newId = () => flatDate() + '_' + randomString();

const onButtonPressed = (it, type) => {
    if(type === 'remove') {
        addToHistoryAndApply({
            action: 'remove',
            item: {
                id: it.id
            }
        });
        reDraw(true);
        resetItemOrderCache();
    } else if(type === 'modifyText') {
        openModificationDialog(it.id);
    } else if(type === 'add') {
        addToHistoryAndApply({
            action: 'add',
            item: {
                id: newId(),
                parentId: it.id,
                text: 'New',
                sizeIndicator: 3
            }
        });
        reDraw(true);
        resetItemOrderCache();
    }
}

const openModificationDialog = (id) => {
    if(!textModificationDialogTextArea) {
        textModificationDialogParent = document.querySelector('#he-dialog-container') || document.createElement('div');
        textModificationDialogParent.id = 'he-dialog-container';
        textModificationDialogParent.style = `
            z-index: 3;
            position: absolute;
            left: 0;
            top: 0;
            height: 100vh;
            width: 100vw;
            background-color: rgba(0,0,0,0.4);
            justify-content: center;
            align-items: center;
        `;
        let originalMouseUpTarget = null;
        textModificationDialogParent.onmousedown = (e) => {
            originalMouseUpTarget = e.target;
        };
        textModificationDialogParent.onmouseup = () => {
            if(originalMouseUpTarget !== textModificationDialogParent) {
                return;
            }
            textModificationDialogParent.style.display = 'none';
            textModificationOpen = false;
        };
        document.body.append(textModificationDialogParent);

        const textModificationDialog = document.querySelector('#he-dialog') || document.createElement('dialog');
        textModificationDialog.id = 'he-dialog';
        textModificationDialog.style = `
            display: flex;
            padding:0;
            border-radius:4px;
            border: 1px solid gray;
        `;
        textModificationDialogParent.append(textModificationDialog);

        textModificationDialogTextArea = document.createElement('textarea');
        textModificationDialogTextArea.style = `
            display: flex;
            min-width: 300px;
            min-height: 100px;
        `;
        textModificationDialog.append(textModificationDialogTextArea);
    }

    textModificationDialogParent.style.display = 'flex';

    textModificationOpen = true;

    const item = items.find(it => it.id === id);

    textModificationDialogTextArea.value = item.text;

    // overwrites existing oninput
    textModificationDialogTextArea.oninput = (e) => {
        const text = e.target.value.trim();
        addToHistoryAndApply({
            action: 'modify',
            item: {
                id,
                text
            }
        });
        reDraw(true);
    }

    textModificationDialogTextArea.select();
}

const isInBorderOf = ({
    mouseX,
    mouseY,
    x,
    y,
    sizePx
}) => {
    const mouseDistance = Math.pow(mouseX - x, 2) + Math.pow(mouseY - y, 2);
    return (
        mouseDistance >= Math.pow(sizePx - 5, 2) &&
        mouseDistance <= Math.pow(sizePx + borderSize(sizePx), 2)
    );
}

const isInRadiusOf = ({
    mouseX,
    mouseY,
    x,
    y,
    sizePx
}) => {
    const mouseDistance = Math.pow(mouseX - x, 2) + Math.pow(mouseY - y, 2);
    return mouseDistance <= Math.pow(sizePx + borderSize(sizePx), 2);
}

const onMouseDown = (e) => {

    if(textModificationOpen) return;

    draggingTarget = null;
    currentlyPanning = false;
    const mouseX = e.clientX;
    const mouseY = e.clientY;
    lastDragInformation = {
        dragStartX: mouseX,
        dragStartY: mouseY,
        dragActive: true,
        dragEndX: null,
        dragEndY: null,
        wasDrag: null
    };
    let foundTarget = false;
    for(let it of items) {
        const wPos = withSizeAndPosition(it);
        if(isInBorderOf({
                ...wPos,
                mouseX,
                mouseY
            })) {
            draggingTarget = it.id;
            foundTarget = true;
            reDraw();
            break;
        }
    }
    if(!foundTarget) {
        currentlyPanning = {
            mouseX,
            mouseY
        };
    }
};

const onMouseMove = (e) => {

    if(textModificationOpen) return;

    const existingHoveringOn = currentlyHoveringOn.slice();
    currentlyHoveringOn = [];
    let redrawRequired = false;
    let cursor = null;

    const mouseX = e.clientX;
    const mouseY = e.clientY;

    // Hover effects
    for(const itKey of itemOrderCache) {
        const wPos = withSizeAndPosition({
            id: itKey
        });
        if(wPos.restrictInteractivity) {
            continue;
        }
        for(let buttonDim of wPos.buttonDimensions.buttons) {
            const radiusCheck = {
                ...wPos.buttonDimensions,
                ...buttonDim,
                mouseX,
                mouseY
            };
            if(isInRadiusOf(radiusCheck)) {
                cursor = "pointer";
                break; // breaks inner loop only
            }
        }
        if(cursor) {
            break;
        }
        if(isInBorderOf({
                ...wPos,
                mouseX,
                mouseY
            })) {
            cursor = "crosshair";
            break;
        }
    }
    for(const itKey of itemOrderCache) {
        const wPos = withSizeAndPosition({
            id: itKey
        });
        if(wPos.restrictInteractivity) {
            continue;
        }
        if(isInRadiusOf({
                ...wPos,
                mouseX,
                mouseY
            })) {
            currentlyHoveringOn.push(itKey);
        }
    }

    // Dragging consequences
    if(lastDragInformation.dragActive) {
        lastDragInformation.wasDrag = true;
        if(currentlyPanning) {
            cursor = "move";
            const movementX = mouseX - currentlyPanning.mouseX;
            const movementY = mouseY - currentlyPanning.mouseY;
            currentlyPanning = {
                mouseX,
                mouseY
            };
            panX += movementX;
            panY += movementY;

            reDraw(true);
        } else if(draggingTarget !== null) {
            const it = items.find(it => it.id === draggingTarget);
            if(it) {
                const itWSize = withSizeAndPosition(it);
                const distance = distanceBetween(mouseX, mouseY, itWSize.x, itWSize.y);
                const keyList = (
                    Object
                    .entries(validSizes)
                    .map(([k, v]) => {
                        let vv = validSizeModifier * v;
                        let vd = Math.abs(distance - vv);
                        return [k, +vv.toFixed(2), +vd.toFixed(2)];
                    })
                    .sort((a, b) => a[2] - b[2])
                );
                const sizeKey = keyList[0][0];
                it.sizeIndicator = sizeKey;
                history.push({
                    action: 'modify',
                    item: {
                        id: it.id,
                        sizeIndicator: it.sizeIndicator
                    }
                });
                clearCacheForItem(it.id);
                cursor = "crosshair";
                redrawRequired = true;
            }
        }
    }

    if(cursor === null) {
        cursor = "default";
    }

    // Apply draw changes
    if(canvas.style.cursor !== cursor) {
        canvas.style.cursor = cursor;
    }
    if(currentlyHoveringOn.length !== existingHoveringOn.length || currentlyHoveringOn.some((el, i) => currentlyHoveringOn[i] !== existingHoveringOn[i])) {
        if(existingHoveringOn.length) {
            existingHoveringOn.forEach(clearCacheForItem);
        }
        redrawRequired = true;
    }
    if(redrawRequired) {
        reDraw();
    }
};

const onMouseUp = (e) => {

    if(textModificationOpen) return;

    const mouseX = e.clientX;
    const mouseY = e.clientY;

    lastDragInformation.dragActive = false;
    lastDragInformation.dragEndX = mouseX;
    lastDragInformation.dragEndY = mouseY;

    let shouldRedraw = false;
    if(currentlyPanning) {
        currentlyPanning = false;
        shouldRedraw = true;
        lastMouseUpWasDragAction = true;
    }
    if(draggingTarget !== null) {
        draggingTarget = null;
        shouldRedraw = true;
        lastMouseUpWasDragAction = true;
    }
    if(shouldRedraw) {
        reDraw();
    }
};

const onMouseClick = (e) => {

    if(textModificationOpen) return;

    if(!lastDragInformation.wasDrag) {
        const mouseX = e.clientX;
        const mouseY = e.clientY;
        for(let it of items) {
            const wPos = withSizeAndPosition(it);
            if(!wPos.restrictInteractivity) {
                for(let i = 0; i < wPos.buttonDimensions.buttons.length; i++) {
                    const radiusCheck = {
                        ...wPos.buttonDimensions,
                        ...wPos.buttonDimensions.buttons[i],
                        mouseX,
                        mouseY
                    };
                    const type = wPos.buttonDimensions.buttons[i].type;
                    if(isInRadiusOf(radiusCheck)) {
                        onButtonPressed(it, type);
                        break;
                    }
                }
            }
        }
    }
};

const onWheel = evt => {

    if(textModificationOpen) return;

    const zoomAmount = -evt.deltaY / 100;
    const zoomChange = zoomAmount * zoomMultiplier;
    const panXChange = (
        Math.floor(
            Math.sqrt(
                (
                    Math.max(evt.pageX, centerX) - Math.min(evt.pageX, centerX)
                )
            )
        ) *
        (evt.pageX > centerX ? -1 : 1) *
        (evt.deltaY > 0 ? -1 : 1)
    );
    const panYChange = (
        Math.floor(
            Math.sqrt(
                (
                    Math.max(evt.pageY, centerY) - Math.min(evt.pageY, centerY)
                )
            )
        ) *
        (evt.pageY > centerY ? -1 : 1) *
        (evt.deltaY > 0 ? -1 : 1)
    );

    panX += panXChange;
    panY += panYChange;
    zoom += zoomChange * Math.sqrt(zoom);
    reDraw(true);
};

const addToHistoryAndApply = (h) => {
    const hCopy = JSON.parse(JSON.stringify(h));
    applyActionToItem(h);
    history.push(hCopy);
    localStorage.setItem(localStorage.getItem(localStorageLastSelectedKey), saveFormat({
        history
    }));
    if(h.action === 'modify') {
        const matchItem = items.find(it => it.id === h.item.id);
        if(matchItem && !matchItem.parentId) {
            renderTabMenu();
        }
    }
};

const applyActionToItem = (h, targetItems) => {
    if(!Array.isArray(targetItems)) {
        targetItems = items;
    }
    if(h.action === 'remove') {
        const removeItem = (id) => {
            const matchIndex = targetItems.findIndex(it2 => it2.id === id);
            if(matchIndex !== -1) {
                targetItems.filter(it2 => it2.parentId === id).forEach(it2 => removeItem(it2.id));
                targetItems.splice(matchIndex, 1);
            }
        }
        removeItem(h.item.id);
    } else if(h.action === 'add') {
        if(targetItems.findIndex(it => it.id === h.item.id) !== -1) {
            throw new Error(`History corrupted, attempted to add pre-existing item '${h.action}'`);
        }
        targetItems.push(h.item);
    } else if(h.action === 'modify') {
        const item = targetItems.find(it2 => it2.id === h.item.id);
        if(typeof h.item.text !== 'undefined') {
            item.text = h.item.text;
        }
    } else {
        throw new Error(`Unrecognized action '${h.action}'`);
    }
}

const rebuildItemsFromHistory = () => {
    items.length = 0;
    history.forEach(applyActionToItem);
};

const saveFormat = ({
        history
    }) =>
    JSON.stringify({
        version: '1',
        history
    });

const loadLocalStorage = () => {
    let selectedTab = localStorage.getItem(localStorageLastSelectedKey);
    const keys = Object.keys(localStorage).filter(k => k.startsWith(localStorageKeyPrefix));
    if(keys.length === 0) {
        keys[0] = addNewTree();
    }

    if(selectedTab === null || !keys.includes(selectedTab)) {
        selectedTab = keys[0];
        localStorage.setItem(localStorageLastSelectedKey, selectedTab);
    }

    const conf = JSON.parse(localStorage.getItem(selectedTab));
    history.length = 0;
    history.push(...conf.history);
    rebuildItemsFromHistory();
}

const addNewTree = () => {
    const newKey = localStorageKeyPrefix + flatDate();
    localStorage.setItem(
        newKey, saveFormat({
            history: [{
                action: 'add',
                item: {
                    id: 'root',
                    text: 'New',
                    sizeIndicator: 3
                }
            }]
        })
    );
    return newKey;
}

const deleteTree = (storageKey) => {
    localStorage.removeItem(storageKey);
}

const renderTabMenu = () => {
    const tabStyle = `
        float:left;
        font-family: ${fontFamily};
        font-size:12px;
        padding: 3px 8px;
        background: #ddd;
        border: 1px solid #ccc;
        border-width:1px 1px 1px 1px;
        border-radius:1px; 
        margin:2px;
        cursor:pointer;
    `;
    tabBar.innerHTML = '';
    const tabs = (
        Object
        .keys(localStorage)
        .filter(k => k.startsWith(localStorageKeyPrefix))
        .map((k, index) => {

            const conf = JSON.parse(localStorage.getItem(k));
            const tempItems = [];
            conf.history.forEach(h => applyActionToItem(h, tempItems));
            const text = tempItems.find(it => !it.parentId).text;
            return {
                storageKey: k,
                index,
                text
            };
        })
        .sort((s1, s2) => s1.storageKey < s2.storageKey ? -1 : s1.storageKey > s2.storageKey ? 1 : 0)
    );

    for(const tab of tabs) {
        const tabElement = document.createElement('div');
        tabElement.dataset.storageKey = tab.storageKey;
        tabElement.dataset.storageArrayIndex = tab.index;
        tabElement.dataset.isSelected = localStorage.getItem(localStorageLastSelectedKey) === tab.storageKey;
        tabElement.innerText = tab.text;
        if(tabElement.dataset.isSelected === "true") {
            tabElement.style = tabStyle + `
                background: #efefef;
                cursor:default;
            `;
        } else {
            tabElement.style = tabStyle;
            tabElement.onclick = () => {
                localStorage.setItem(localStorageLastSelectedKey, tab.storageKey);
                resetCameraLocation();
                loadLocalStorage();
                renderTabMenu();
                reDraw(true);
                resetItemOrderCache();
            }
        }
        tabBar.append(tabElement);
    }

    const addElement = document.createElement('div');
    addElement.innerText = '+';
    addElement.style = tabStyle;
    addElement.onclick = () => {
        addNewTree();
        resetCameraLocation();
        loadLocalStorage();
        renderTabMenu();
        reDraw(true);
        resetItemOrderCache();
    };
    tabBar.append(addElement);

    const removeElement = document.createElement('div');
    removeElement.innerText = 'X';
    removeElement.style = tabStyle + 'float:right;';
    removeElement.onclick = () => {
        const tab = tabs.find(t => t.storageKey === localStorage.getItem(localStorageLastSelectedKey));
        const confirmed = confirm(`Are you sure you want to delete ${tab.text}?`);
        if(confirmed) {
            deleteTree(localStorage.getItem(localStorageLastSelectedKey));
            resetCameraLocation();
            loadLocalStorage();
            renderTabMenu();
            reDraw(true);
            resetItemOrderCache();
        }
    };
    tabBar.append(removeElement);
};

const initializeHtml = () => 
{
    tabBar = document.querySelector('#he-tabbar') || document.createElement('div');
    tabBar.id = 'he-tabbar';
    tabBar.style = `
        position:absolute;
        top:0;
        right:0;
        left:0;
        height:25px;
        z-index:2;
    `;
    document.body.appendChild(tabBar);    
    canvas = document.getElementById('-];display-canvas');
    if(canvas) {
        document.body.removeChild(canvas);
    }
    canvas = document.createElement('canvas');
    canvas.id = 'display-canvas';
    canvas.style.display = 'block';
    canvas.style.position = 'absolute';
    canvas.style.left = '0';
    canvas.style.top = '0';
    canvas.style.zIndex = 1;
    canvas.style.background = '#fff';
    document.body.style.margin = '0';
    document.body.style.padding = '0';
    document.body.style.padding = '0';
    document.body.style.overflow = 'hidden';
    document.body.appendChild(canvas);
    context = canvas.getContext('2d');

    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('click', onMouseClick);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('wheel', onWheel);
    window.addEventListener('resize', resizeCanvas);
    
    if(window.tidyup) {
        window.tidyup();
    }

    window.tidyup = () => {
        console.clear();
        window.removeEventListener('mousedown', onMouseDown);
        window.removeEventListener('click', onMouseClick);
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        window.removeEventListener('wheel', onWheel);
        window.removeEventListener('resize', resizeCanvas);
    };
}

// Initialisation
import('https://unpkg.com/canvas-txt@4.1.1/dist/canvas-txt.umd.js').then(() =>
{
    initializeHtml();
    resetCameraLocation();
    loadLocalStorage();
    items.forEach(withSizeAndPosition);
    resetItemOrderCache();
    resizeCanvas();
    renderTabMenu();
});