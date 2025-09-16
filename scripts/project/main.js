"use strict";
// Import any other script files here, e.g.:
// import * as myModule from "./mymodule.js";
let checkPoints = [];
let config;
const lerp = (start, end, amt) => (1 - amt) * start + amt * end;
const baseSize0 = 100;
const baseY = 600;
function getConfig() {
    return config;
}
function initPoints(runtime) {
    const checkpointInsts = runtime.objects.Checkpoint.getAllInstances();
    //console.log(checkpointInsts);
    checkpointInsts.sort((p1, p2) => p1.instVars.Index - p2.instVars.Index)
        .forEach(p => {
        checkPoints.push({ uid: p.uid, x: p.x, y: p.y });
    });
    //console.log(checkPoints)
}
function calculatePositionOnTrajectory(trajectory, distance) {
    let totalDistance = 0;
    // Iterate over each segment of the trajectory
    for (let i = 0; i < trajectory.length - 1; i++) {
        const segmentStart = trajectory[i];
        const segmentEnd = trajectory[i + 1];
        // Calculate the distance of the current segment
        const segmentDistance = Math.sqrt(Math.pow(segmentEnd.x - segmentStart.x, 2) +
            Math.pow(segmentEnd.y - segmentStart.y, 2));
        // Check if the object lies on this segment
        if (totalDistance + segmentDistance >= distance) {
            // Calculate the position of the object on this segment
            const remainingDistance = distance - totalDistance;
            const ratio = remainingDistance / segmentDistance;
            const posX = segmentStart.x + ratio * (segmentEnd.x - segmentStart.x);
            const posY = segmentStart.y + ratio * (segmentEnd.y - segmentStart.y);
            return { uid: 0, x: posX, y: posY };
        }
        // Move to the next segment
        totalDistance += segmentDistance;
    }
    // If the distance exceeds the total length of the trajectory, return null
    return null;
}
function getParamsFromURL() {
    // Получаем строку запроса (query string) из URL
    let queryString = window.location.search;
    // Создаем экземпляр URLSearchParams
    let searchParams = new URLSearchParams(queryString);
    // Создаем объект для хранения параметров
    let params = {};
    // Проходим по всем параметрам
    for (let [key, value] of searchParams.entries()) {
        params[key] = value;
    }
    // Возвращаем параметры
    return params;
}
function isInAppMode() {
    return getParamsFromURL()["inAppMode"] != undefined;
}
function sendScore(score) {
    let params = getParamsFromURL();
    console.log('UID:', params.uid);
    console.log('IMID:', params.imid);
    //console.log('TG Share Score URL:', params['tgShareScoreUrl']);
    //http://127.0.0.1:3000/index.html?uid=182669810&imid=AgAAAEzrBQDyUeMKvHKPKnpdHHg#tgShareScoreUrl=tg%3A%2F%2Fshare_game_score%3Fhash%3DgOZEhzb61ZMw_vIHfoPz06n0rslM5mzCsx8HegCAnxPnjcmDTNs4YCVDYuVRT8qQ
    let uid = params.uid;
    let imid = params.imid;
    // uid = 182669810;
    // imid = 'AgAAAEzrBQDyUeMKvHKPKnpdHHg';
    fetch(`https://bot.gritsenko.biz/setScore?uid=${uid}&imid=${imid}&score=${score}`);
}
async function loadConfig(runtime) {
    // Get the correct URL to fetch
    const textFileUrl = await runtime.assets.getProjectFileUrl("config.json");
    // Now fetch that URL normally
    const response = await fetch(textFileUrl);
    config = await response.json();
    //config = gameConfig;
    //console.log("config loaded:", config);
    config.feed = config.feed.reverse();
    //config.feed = [];
}
runOnStartup(async (runtime) => {
    // Code to run on the loading screen.
    // Note layouts, objects etc. are not yet available.
    globalThis.isInAppMode = isInAppMode;
    globalThis.sendScore = sendScore;
    globalThis.getConfig = getConfig;
    globalThis.getNextEnemyIndex = getNextEnemyIndex;
    globalThis.initPoints = initPoints;
    globalThis.setEnemyPos = setEnemyPos;
    globalThis.findSameTypeGroupItems = findSameTypeGroupItems;
    await loadConfig(runtime);
    runtime.addEventListener("beforeprojectstart", () => OnBeforeProjectStart(runtime));
});
async function OnBeforeProjectStart(runtime) {
    // Code to run just before 'On start of layout' on
    // the first layout. Loading has finished and initial
    // instances are created and available to use here.
    //globalThis.initPoints(runtime);
    runtime.addEventListener("tick", () => Tick(runtime));
}
function findSameTypeGroupItems(runtime) {
    const items = runtime.objects.Target
        .getAllInstances()
        .sort((a, b) => b.instVars.order - a.instVars.order);
    let lastGroupId = -1;
    let lastEnemyType = -1;
    let bonusOrder = -1;
    const groupsToDestory = [];
    items.forEach(item => {
        if (item.instVars.DestroyCooldown == 0) {
            const curGroupId = item.instVars.GroupId;
            const curEnemyType = item.instVars.enemyType;
            if (runtime.globalVars.NextGroupId != curGroupId
                && lastGroupId != curGroupId
                && lastEnemyType == curEnemyType) {
                if (groupsToDestory.indexOf(lastGroupId) == -1)
                    groupsToDestory.push(lastGroupId);
                if (groupsToDestory.indexOf(curGroupId) == -1)
                    groupsToDestory.push(curGroupId);
            }
            lastEnemyType = curEnemyType;
            lastGroupId = curGroupId;
        }
    });
    //console.log("groups to destory", groupsToDestory);
    const result = {
        order: bonusOrder,
        x: 0,
        y: 0,
        distance: 0,
        groupId: 0,
        items: new Array()
    };
    items.forEach(item => {
        if (groupsToDestory.indexOf(item.instVars.GroupId) != -1) {
            result.items.push(item);
            if (bonusOrder === -1 && item.instVars.order != undefined) {
                bonusOrder = item.instVars.order;
                result.order = item.instVars.order;
                result.x = item.x;
                result.y = item.y;
                result.distance = item.instVars.distance;
                result.groupId = item.instVars.GroupId;
            }
        }
    });
    const firstItem = result.items[0];
    const lastItem = result.items[result.items.length - 1];
    if (firstItem && lastItem) {
        result.distance = (lastItem.instVars.distance + firstItem.instVars.distance) / 2;
        const pos = calculatePositionOnTrajectory(checkPoints, result.distance);
        if (pos != null) {
            result.x = pos.x;
            result.y = pos.y;
        }
    }
    return result;
}
async function doTween(runtime, inst, x = 0, y = 0) {
    // Create a tween that moves it to (300, 300) over 2 seconds
    const tween = inst.behaviors.Tween.startTween("position", [x, y], 0.5, "linear");
    // Wait for the tween to finish
    await tween.finished;
    // Log to the console now the tween has finished
    //console.log("Tween finished");
}
function Tick(runtime) {
    if (runtime.globalVars.IsGameOver || !runtime.globalVars.IsGameActive)
        return;
    // Code to run every tick
    const dt = runtime.dt;
    const targets = runtime.objects.Target.getAllInstances();
    const targetsCount = targets.length;
    let i = targetsCount;
    const totalDist = targets.reduce((acc, inst) => acc + inst.instVars.Size, 0);
    let curDist = totalDist;
    const scaleFactor = Math.sin(18 * Math.PI / 180) / 2;
    const speed = runtime.globalVars.NewItemsRate;
    const sortedTargets = targets.sort((a, b) => a.instVars.order - b.instVars.order);
    sortedTargets.forEach(inst => {
        curDist -= inst.instVars.Size;
        if (inst.instVars.DestroyCooldown == 0)
            inst.instVars.destDistance = curDist;
        let isMovingBackward = inst.instVars.odlDestDist > inst.instVars.destDistance;
        inst.instVars.odlDestDist = inst.instVars.destDistance;
        const oldDist = inst.instVars.distance;
        inst.instVars.distance = lerp(inst.instVars.distance, inst.instVars.destDistance, isMovingBackward || inst.instVars.DestroyCooldown > 0 ? 0.1 * speed : 0.03 * speed);
        //inst.instVars.distance = inst.instVars.destDistance;
        const ox = inst.x;
        const oy = inst.y;
        //if (inst.instVars.DestroyCooldown === 0)
        setEnemyPos(inst, inst.instVars.distance);
        const dx = inst.x - ox;
        const dy = inst.y - oy;
        let invScale = 1;
        if (!inst.instVars.IsBonus) {
            invScale = dx < 0 ? -1 : 1;
            if (oldDist > inst.instVars.distance) {
                invScale = -invScale;
            }
        }
        const s = Math.max(baseSize0 + 10, Math.min(baseSize0 + 80, scaleFactor * (inst.y)));
        if (inst.instVars.DestroyCooldown <= 0) {
            inst.width = s * invScale * inst.instVars.SpriteScale;
            const offset = inst.behaviors.FloatAnim.value;
            inst.height = s * inst.instVars.SpriteScale + offset;
        }
        inst.instVars.YPos = inst.y;
        i--;
    });
}
function setEnemyPos(inst, dist) {
    var pos = calculatePositionOnTrajectory(checkPoints, dist);
    if (pos != null) {
        inst.x = pos.x;
        inst.y = pos.y;
    }
}
let tubes = [0, 1, 2, 3];
// let bombs = [5,6];
let hist = [6, 6, 6];
function getNextEnemyIndex(runtime) {
    if (getConfig().feed.length > 0) {
        const feedIndex = getConfig().feed.pop();
        if (feedIndex != undefined) {
            hist.unshift(feedIndex);
            hist.pop();
            return feedIndex;
        }
    }
    ;
    const level = runtime.globalVars.lvl;
    const upgradeLevel = runtime.globalVars.LaserLevel;
    const turretLevel = runtime.globalVars.TurretLevel;
    //hist == undefined ? hist = [6, 6, 6] : null;
    let choices = [];
    let playerDominance = upgradeLevel + turretLevel - level;
    if (!(hist.includes(5) || hist.includes(6)))
        choices.push(5, 6);
    if (playerDominance <= 1 && !choices.includes(5) && hist[0] != 5 && hist[0] != 6)
        choices.push(5, 6);
    if (playerDominance >= 2 && !tubes.includes(4))
        tubes.push(4);
    for (let i = 0; i < tubes.length; i++) {
        if (tubes[i] == hist[0])
            continue;
        else
            choices.push(tubes[i]);
        if (!hist.includes(tubes[i]))
            choices.push(tubes[i]);
        if (playerDominance > 1 && !hist.includes(tubes[i]))
            choices.push(tubes[i]);
        if (playerDominance <= 1 && hist[1] == tubes[i])
            choices.push(tubes[i]);
        if (playerDominance <= 2 && hist[2] == tubes[i])
            choices.push(tubes[i]);
    }
    let res = choices[Math.floor(Math.random() * choices.length)];
    hist.unshift(res);
    hist.pop();
    //console.log(hist);
    return res;
}
