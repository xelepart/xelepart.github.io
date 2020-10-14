// global context 'cause' that's how this seems to work?
var game = null;
var player = null;

// UI elements (should probably load all these in startGame() once, but the internet says one of the biggest/most common
// efficiency failures in html5 games is re-fetching DOM elements,
// so figured we should do this one particular premature optimization.
var canvasdiv = document.getElementById("canvasdiv");
var canvas = document.getElementById("canvas");
var ctx = canvas.getContext("2d");
var popupText = document.getElementById("PopupText");
var popupDiv = document.getElementById("popup");

var miscResourcesSpan = document.getElementById("MiscResources");
var miscSkillsSpan = document.getElementById("MiscSkills");
var miscToolsSpan = document.getElementById("MiscTools");
var totalLivesSpan = document.getElementById("TotalLives");
var ageValueSpan = document.getElementById("age");
var ageLabelSpan = document.getElementById("agelabel");

var tooltip = document.getElementById("tooltip");

var needRedraw = true; // this is the "UI is dirty" flag, 'cause nobody likes games that run at 100% cpu...

//GAMESPEED_RATIO = 1 / (5 * 60 * 1000)  // 1 year every 5 minutes in ms
//GAMESPEED_RATIO = 1 / (1 * 1000)  // 1 year every 1 seconds in ms
GAMESPEED_RATIO = 1 / (1 * 250)  // 1 year every .1 seconds in ms

var computeResourceGeneration = function(task, resourceName, rawAmount) {
    if (!player.resources[resourceName]) {
        player.resources[resourceName] = 0;
    }

    var skillsModifier = ((!task.def.categories) ? 1 : Object.entries(task.def.categories).map((e) => {
        var cat = e[0];
        var contribution = e[1];
        var playerskill = player.skills[cat]||0;

        return contribution * playerskill;
    }).reduce((a, b) => a + b, 1));

    var historyBoost = Math.pow(1.1,task.history.maxlevel);

    if (task.def.achievement) {
        //achievements are a one-off, and shouldn't get a 10% bonus for their one-ness?
        // but i can see them getting a bonus from categorical bonuses and some other stuff?
        historyBoost = 1;
    }
    return (rawAmount*skillsModifier)*historyBoost // this should get complicated with groundhog meta?
}

function computeCompletionYears(task) {
    var toolsModifier = ((!task.def.categories) ? 1 : Object.entries(task.def.categories).map((e) => {
        var cat = e[0];
        var contribution = e[1];
        var playertool = player.tools[cat]||0;

        return contribution * playertool;
    }).reduce((a, b) => a + b, 0));

    return task.def.completionYears * Math.pow(0.99,(task.history.maxlevel + toolsModifier));
}

function computeCompletionCost(task, amount) {
    return amount * Math.pow(0.97,task.history.maxlevel);
}

var processPassiveTask = function(task, yearsElapsed) {
    for (resource in task.def.passiveGeneration) {
        if (!player.resources[resource]) {
            player.resources[resource] = 0;
        }
        player.resources[resource] += computeResourceGeneration(task, resource, task.def.passiveGeneration[resource]*yearsElapsed);
    }
}

var checkVisibleTasks = function() {
    game.tasks = [];

    hoveredTaskStillVisible = false;

    var recheck = true;
    while (recheck) {
        recheck = false;
        Object.entries(game.alltasks).forEach(e => {
            var task = e[1];

            var unlocked = task.def.achievement && (task.life.level > 0 || task.history.maxlevel > 0);
            if (unlocked) return; // we don't show unlocked achievements again?

            var completed = !task.def.repeatable && task.life.level > 0;

            var freebie = task.def.unlock === null;
            var active = task.life.level > 0;

            var taskLevelPrereqMet = task.def.unlock !== null && (task.def.unlock.taskid && task.def.unlock.level && game.alltasks[task.def.unlock.taskid].life.level >= task.def.unlock.level);
            var resourcePrereqMet = task.def.unlock !== null && (task.def.unlock.resourceName && player.resources[task.def.unlock.resourceName] >= task.def.unlock.amount);
            var historicTaskLevelPrereqMet = task.def.unlock !== null && (task.def.unlock.taskid && task.def.unlock.historiclevel && game.alltasks[task.def.unlock.taskid].history.maxlevel >= task.def.unlock.historiclevel);
            var prereqMet = taskLevelPrereqMet || resourcePrereqMet || historicTaskLevelPrereqMet;

            var permanentPreviousLive = (task.def.unlock !== null) && task.def.unlock.permanent && task.history.everlive;

            var actuallyVisible = freebie || active || prereqMet || permanentPreviousLive;
            var hintmode = !actuallyVisible && task.def.parenttask && game.alltasks[task.def.parenttask.taskid].history.seen && !(game.alltasks[task.def.parenttask.taskid].history.mode=='hintmode');
            var previouslyDone = task.history.maxlevel > 0;

            if (actuallyVisible || hintmode || previouslyDone) {
                task.history.mode = completed ? 'completed' : actuallyVisible ? 'live' : previouslyDone ? 'locked' : 'hintmode';
                if (actuallyVisible) {
                    task.history.everlive = true;
                }
                game.tasks.push(task);
                if (task === hoveredOverTask) hoveredTaskStillVisible = true;
                if (!task.history.seen) {
                    recheck = true;
                    needRedraw = true;
                    task.history.seen = true;
                    offsettask = task.def.parenttaskid ? game.alltasks[task.def.parenttaskid] : task.def.unlock && task.def.unlock.taskid ? game.alltasks[task.def.unlock.taskid] : null;
                    task.history.x = offsettask ? offsettask.history.x + 60 : player.history.nextMiscX;
                    task.history.y = offsettask ? offsettask.history.y : (player.history.nextMiscY += 60);
                }
            }
        });

    }

    if (!hoveredTaskStillVisible) {
        hoveredOverTask = null;
        hideToolTip();
    } else {
        updateTooltipText();
    }
}

var completeTask = function(task) {
    if (task.def.completionGeneration != null) {
        for (resource in task.def.completionGeneration) {
            if (!player.resources[resource]) {
                player.resources[resource] = 0;
            }
            player.resources[resource] += computeResourceGeneration(task, resource, task.def.completionGeneration[resource]);
        }
    }

    if (task.def.completionLearn != null) {
        for (skill in task.def.completionLearn) {
            if (!player.skills[skill]) {
                player.skills[skill] = 0;
            }
            player.skills[skill] += task.def.completionLearn[skill];
        }
    }

    if (task.def.completionTools != null) {
        for (tool in task.def.completionTools) {
            if (!player.tools[tool]) {
                player.tools[tool] = 0;
            }
            player.tools[tool] += task.def.completionTools[tool];
        }
    }

    task.life.level++;

    if (!task.history.evercompleted) {
        sendMessage("<i>" + task.def.predescription + "</i><br>" + task.def.completionstory, false);
        task.history.evercompleted = true;
    }

    // the important part of a completed task is checking if new tasks are unlocked
    // (one day this might happen outside of task completion/game init 'cause who tf knows what would cause unlocks? maybe?)
    checkVisibleTasks();
}

var doTask = function(task) {
    if (task === null) return;
    if (player.activetaskid !== null) return;
    if (!task.def.repeatable && task.level > 0) return;

    if (task.def.completionCosts) {
        var missingResources = false;
        Object.entries(task.def.completionCosts).forEach((e)=> {
            resource = e[0];
            amount = computeCompletionCost(task,e[1]);
            if ((player.resources[resource]||0) < amount) {
                missingResources = true;
            }
        });
        if (missingResources) {
            sendMessage("Not enough resources!", false);
            return;
        } else {
            Object.entries(task.def.completionCosts).forEach((e)=> {
                resource = e[0];
                amount = computeCompletionCost(task,e[1]);
                player.resources[resource] -= amount;
            });
        }
    }
    // if we can't do this task for some other reason, return? Not visible (cheaters!)? Not enough money? (need a UI indicator for that when i wrote this...)

    player.activetaskid = task.def.taskid;
    task.life.yearsWorked = 0;
}

function sendMessage(text, popup) {
    if (popup) {
        popupText.innerHTML = text;
//        popupDiv.style.display="block";
    }

    messageBlock = document.getElementById("messages")
    messageBlock.innerHTML = messageBlock.innerHTML + "<br/>" + text + "<br/>";
    messageBlock.scrollTo(0,999999);
}

function closePopup() {
    popupDiv.style.display="none";
}

function resetPlayer() {
    player.age = game.startage;
    player.activetaskid = null;
    player.resources = {};
    player.skills = player.history.skills||{};
    checkVisibleTasks();

    player.skills = {};
    Object.entries(player.history.skills).forEach(e => {
        var skill = e[0];
        var lvl = e[1];

        player.skills[skill] = lvl/10;
    });

    Object.entries(game.alltasks).forEach(e => {
        var task = e[1];

        task.history.mode = 'locked';

        if (task.def.achievement) { // only achievements directly impact new lives.
            if (task.history.maxlevel > 0) {
                if (task.def.newlifeResources) {
                    for (resource in task.def.newlifeResources) {
                        if (!player.resources[resource]) {
                            player.resources[resource] = 0;
                        }
                        player.resources[resource] += computeResourceGeneration(task, resource, task.def.newlifeResources[resource]);
                    }
                }
            }
        }
    });

    checkVisibleTasks();

    player.tools = {};
    // tools all reset to 0 on new life.

    refreshStats();
    needRedraw = true;
}

function killPlayer(description) {
    if (description) sendMessage(description, true);

    Object.entries(game.alltasks).forEach(e => {
        var task = e[1];

        if (task.def.repeatable) {
            task.history.maxlevel = Math.max((task.history.maxlevel||0), (task.life.level||0));
        } else {
            task.history.maxlevel = (task.history.maxlevel||0) + task.life.level; // for repeatables, they get more "powerful" every time you do it.
        }
        task.life.level = 0;
    });

    Object.entries(player.skills).forEach(e => {
        var skill = e[0];
        var lvl = e[1];

        player.history.skills[skill] = Math.max((player.history.skills[skill]||0), lvl);
    });

    Object.entries(player.tools).forEach(e => {
        var tool = e[0];
        var quality = e[1];

        player.history.tools[tool] = Math.max((player.history.tools[tool]||0), quality);
    });

    player.pastlives = (player.pastlives||0) + 1;

    resetPlayer();
    window.localStorage.setItem("player", btoa(JSON.stringify(player)));
    needRedraw = true;
}

function refreshStats()
{
    ageValueSpan.innerHTML=Math.round(player.age * 10) / 10;
    if (game.maxage - player.age > 5) {
        ageLabelSpan.style.color="lightgreen";
    } else {
        ageLabelSpan.style.color="pink";
    }

    if (player.pastlives > 2) {
        totalLivesSpan.innerHTML = " (life #" + (player.pastlives + 1 + ")");
    }

    // how should we order these? Most recently gained? Manual list? Alphabetical? Most-owned? order-originally-seen maintained over history, with maybe optional reordering?
    var miscResourcesSpanInnerHTML = "";
    for (resource in player.resources) {
        miscResourcesSpanInnerHTML += resource + ": " + Math.round(player.resources[resource] * 10) / 10 + "</br>";
    }
    if (miscResourcesSpanInnerHTML == "") miscResourcesSpanInnerHTML = "A whole lotta nothin'!";
    miscResourcesSpan.innerHTML = miscResourcesSpanInnerHTML;

    var miscSkillsSpanInnerHTML = "";
    for (skill in player.skills) {
        miscSkillsSpanInnerHTML += skill + ": " + Math.round(player.skills[skill] * 10) / 10 + "</br>";
    }
    if (miscSkillsSpanInnerHTML == "") miscSkillsSpanInnerHTML = "Uh, breathing, I guess?";
    miscSkillsSpan.innerHTML = miscSkillsSpanInnerHTML;

    var miscToolsSpanInnerHTML = "";
    for (tool in player.tools) {
        miscToolsSpanInnerHTML += tool + ": " + Math.round(player.tools[tool] * 10) / 10 + "</br>";
    }
    if (miscToolsSpanInnerHTML == "") miscToolsSpanInnerHTML = "Big, meaty hands.";
    miscToolsSpan.innerHTML = miscToolsSpanInnerHTML;

    // improvement ideas:
    // put passive amount/year next to each amount
}

var update = function(elapsed) {
    var shouldSave = false;
    if (player.activetaskid) { // if no active task, we don't update the game! NOT IDLE!
        needRedraw = true; // i was getting sick of my CPU running at 100%, so game updates don't trigger draw updates if they don't need to?
        var playertask = game.alltasks[player.activetaskid];
        var maxYearsElapsed = elapsed * GAMESPEED_RATIO;
        var remainingYears = computeCompletionYears(playertask) - playertask.life.yearsWorked;
        var yearsElapsed = Math.min(maxYearsElapsed, remainingYears);

        // continue the active task...
        playertask.life.yearsWorked += yearsElapsed;

        if (computeCompletionYears(playertask) == playertask.life.yearsWorked) {
            player.activetaskid = null;
            completeTask(playertask);
            shouldSave = true;
        }

        // not in V1, but this is probably where automated tasks would go?
        // game.autotasks.forEach(task => { ...
        Object.values(game.alltasks).forEach(task => {
            // if this task is active (level > 0) and generates passive income, we do that here.
            if (task.life.level > 0) {
                if (task.def.passiveGeneration != null) {
                    processPassiveTask(task, yearsElapsed);
                }
            }
        });

        player.age += yearsElapsed;

        if (player.age >= game.maxage) {
            killPlayer("Oh no! You died of old age! Blah blah blah story wtf you're " + game.startage + " again");
        }
    }
    refreshStats();
    if (shouldSave) window.localStorage.setItem("player", btoa(JSON.stringify(player)));
}

var hintImage = new Image();
hintImage.onload = function() { needRedraw = true; }
hintImage.src = "images/hint.png"
var lockImage = new Image();
lockImage.onload = function() { needRedraw = true; }
lockImage.src = "images/lock.png"

canvas.width = 3000;//canvasdiv.offsetWidth;
canvas.height = 3000;//canvasdiv.offsetHeight;

var draw = function() {
    needRedraw = false;

    var p1 = ctx.transformedPoint(0,0);
    var p2 = ctx.transformedPoint(canvas.width,canvas.height);
    ctx.fillStyle = "#222222";
    ctx.fillRect(p1.x,p1.y,p2.x-p1.x,p2.y-p1.y);

    game.tasks.forEach(task => {
        var image = task.def.img;
        if (image == null) {
            if (!(task.history.mode=='hintmode')) {
                task.def.img = new Image();
                task.def.img.onload = function() {
                    needRedraw = true;
                    task.def.img.onload = null;
                }
                task.def.img.src = task.def.imageUrl;
                return;
            }
        }

        if (task.history.mode=='hintmode') {
            image = hintImage;
        }

        ctx.drawImage(image, task.history.x-25, task.history.y-25, 50, 50);

        if (task.history.mode=='locked' || task.history.mode=='completed') {
            ctx.globalAlpha = 0.8
            ctx.beginPath();
            ctx.moveTo(task.history.x, task.history.y);
            ctx.lineTo(task.history.x, task.history.y + 25);
            ctx.arc(task.history.x, task.history.y, 25, -0.5*Math.PI, 2 * Math.PI - 0.5*Math.PI, true);
            ctx.lineTo(task.history.x, task.history.y);
            ctx.fill();
            ctx.globalAlpha = 1
        }

        if (task.history.mode=='locked') {
            ctx.drawImage(lockImage, task.history.x, task.history.y, 25, 25);
            ctx.globalAlpha = 1
        }

        if (task.history.mode=='completed') {
            ctx.globalAlpha = 0.6
            ctx.beginPath();
            ctx.moveTo(task.history.x-5, task.history.y+10);
            ctx.lineTo(task.history.x+10, task.history.y+20);
            ctx.lineTo(task.history.x+20, task.history.y-5);
            ctx.lineWidth = 10;
            ctx.strokeStyle = '#00AA00';
            ctx.stroke();
            ctx.fillStyle = "#222222";
            ctx.globalAlpha = 1
        }

        if (task.def.taskid === player.activetaskid) {
            var pctComplete = task.life.yearsWorked / computeCompletionYears(task);

            ctx.globalAlpha = 0.3
            ctx.beginPath();
            ctx.moveTo(task.history.x, task.history.y);
            ctx.lineTo(task.history.x, task.history.y + 25);
            ctx.arc(task.history.x, task.history.y, 25, -0.5*Math.PI, 2 * Math.PI * pctComplete - 0.5*Math.PI, true);
            ctx.lineTo(task.history.x, task.history.y);
            ctx.fill();
            ctx.globalAlpha = 1
        }
    })
//    ctx.restore();
}

function loop(timestamp) {
    var progress = timestamp - lastRender

    if (lastRender > 0) {
        update(progress)
        if (needRedraw) {
            draw()
        }
    }

    lastRender = timestamp
    window.requestAnimationFrame(loop)
}
var lastRender = 0

function findClosestTask(evt) {
    var rect = canvas.getBoundingClientRect();
    var x = event.clientX - rect.left;
    var y = event.clientY - rect.top;

    var pt = ctx.transformedPoint(x,y);

    var closestTask = null;
    var closestClick = 25.1;

    game.tasks.forEach(task => {
        xd = task.history.x - pt.x;
        yd = task.history.y - pt.y;
        d = Math.sqrt(xd*xd+yd*yd)
        if (d < closestClick) {
            closestClick = d;
            closestTask = task;
        }
    });
    return closestTask;
}

function updateTooltipText() {
    if (!hoveredOverTask) hideToolTip();

    needRedraw = true; // i was getting sick of my CPU running at 100%, so game updates don't trigger draw updates if they don't need to?

    if (hoveredOverTask.history.mode=='hintmode') {
        tooltip.innerHTML = hoveredOverTask.def.hint;
        return;
    }

    var priorLevelDetailString = " (new)";
    if (!hoveredOverTask.def.repeatable) {
        if (hoveredOverTask.history.maxlevel > 0) {
            if (hoveredOverTask.life.level > 0) {
                priorLevelDetailString = " (Completed this life, and completed " + hoveredOverTask.history.maxlevel + " times in the past)";
            } else {
                priorLevelDetailString = " (Incomplete this life, but completed " + hoveredOverTask.history.maxlevel + " times in the past)";
            }
        } else if (hoveredOverTask.life.level > 0) {
            priorLevelDetailString = " (Completed)";
        }
    } else {
        if (hoveredOverTask.history.maxlevel > 0) {
            if (hoveredOverTask.life.level > 0) {
                priorLevelDetailString = " (level " + hoveredOverTask.life.level + ", highest previous level:" + hoveredOverTask.history.maxlevel + ")";
            } else {
                priorLevelDetailString = " (new, highest previous level:" + hoveredOverTask.history.maxlevel + ")";
            }
        } else if (hoveredOverTask.life.level > 0) {
            priorLevelDetailString = " (level " + hoveredOverTask.life.level + ")";
        }
    }

    tooltip.innerHTML = hoveredOverTask.def.name + priorLevelDetailString + (hoveredOverTask.history.mode=='locked' ? "(LOCKED)" : "") + "<br/>"
                   + (hoveredOverTask.history.evercompleted ? hoveredOverTask.def.description : hoveredOverTask.def.predescription) + "<br/>"
                   + "Takes " + Math.round(computeCompletionYears(hoveredOverTask)*100)/100 + " years<br/>"
                   + (hoveredOverTask.def.completionCosts ? "Doing this would cost...<br/>" + Object.entries(hoveredOverTask.def.completionCosts).map(e => e[0] + ": " + (Math.round(computeCompletionCost(hoveredOverTask, e[1])*10)/10)) + "<br/>" : "")
                   + (hoveredOverTask.def.passiveGeneration ? (hoveredOverTask.life.level > 0 ? "Currently passively producing " : "Upon completion would start to passively produce ") + "the following per year...<br/>" + Object.entries(hoveredOverTask.def.passiveGeneration).map(e => e[0] + ": " + (Math.round(computeResourceGeneration(hoveredOverTask, e[0], e[1])*10)/10)) + "<br/>" : "")
                   + (hoveredOverTask.def.completionGeneration ? "Upon completion, will produce...<br/>" + Object.entries(hoveredOverTask.def.completionGeneration).map(e => e[0] + ": " + (Math.round(computeResourceGeneration(hoveredOverTask, e[0], e[1])*10)/10)) + "<br/>" : "")
                   + (hoveredOverTask.def.completionLearn ? "Upon completion, you would learn skills...<br/>" + Object.entries(hoveredOverTask.def.completionLearn).map(e => e[1] + " levels of the " + e[0]) + " skill<br/>" : "")
                   + (hoveredOverTask.def.completionTools ? "Upon completion, you will receive tools...<br/>" + Object.entries(hoveredOverTask.def.completionTools).map(e => "quality " + e[1] + " tools for " + e[0]) + "<br/>" : "")
                   + ((hoveredOverTask.life.level===0 && hoveredOverTask.history.maxlevel===0) ? "<br/>Is " + (hoveredOverTask.def.repeatable ? "" : "not ") + " repeatable after first completion.<br/>" : "");
   // things to maybe add:
   // "Will unlock..." ? (not sure i want this in the tooltip, honestly)
   // How much passive it would produce if you leveled it up. (also: passives should go up with life.level?)
   // Highest level you've ever had.
   // Current level.
   // If it's the active (or automated) task, say that instead of what it would cost/etc?
}

function showToolTip() {
    updateTooltipText();
    tooltip.style.left = event.clientX + 20;
    tooltip.style.top = event.clientY;
    tooltip.style.display = "block";
}

function hideToolTip() {
    if (tooltip.style.display != "none") {
        needRedraw = true; // i was getting sick of my CPU running at 100%, so game updates don't trigger draw updates if they don't need to?
        tooltip.style.display="none";
    }
}

function registerTaskDefinition(taskDefinition) {
    if (game.alltasks[taskDefinition.taskid]) {
        alert("Game definition invalid: taskid " + taskDefinition.taskid + " was defined twice. (Please contact the devs and report this!)");
        return;
    }

    var task = {def:taskDefinition,life:{level:0},history:{maxlevel:0}};
    game.alltasks[taskDefinition.taskid] = task;
    if (player.tasks[taskDefinition.taskid]) {
        // this would mean we loaded the savestate from disk, so pull from player. (could be some weird stuff with loading old saves for new content?)
        task.life = player.tasks[taskDefinition.taskid].life;
        task.history = player.tasks[taskDefinition.taskid].history;
    } else {
        // if the player doesn't yet have a history for this task, either we didn't load from disk or it's a new task added by new content.
        var playertask = {life:task.life, history:task.history};
        player.tasks[taskDefinition.taskid] = playertask;
    }
}

function verifyTasks() {
    Object.entries(game.alltasks).forEach(e => {
        var task = e[1];
        if (task.def.unlock && task.def.unlock.taskid && !game.alltasks[task.def.unlock.taskid]) alert("Game definition invalid: Task " + task.taskid + " refers to non-existent task " + task.def.unlock.taskid + " for an unlock prerequisite. (Please contact the devs and report this!)");
        // other things to check: Task's unlock resoures are generated somewhere? (not trying to solve the graph, just sanity check for typos?)
        return;
    });
}

function checkAndHardReset() {
   if (confirm("You really want to start completely over?")) hardReset();
}

function hardReset() {
    player = {tasks:{},resources:{},skills:{},tools:{},activetaskid:null,history:{nextMiscX:300,nextMiscY:100,camscale:2,camtransx:-500,camtransy:-250,skills:{},tools:{}}}
    Object.entries(game.alltasks).forEach(e => {
        var task = e[1];
        task.life = {level:0};
        task.history = {maxlevel:0};
        var playertask = {life:task.life, history:task.history};
        player.tasks[task.taskid] = playertask;
    });
    killPlayer();
}

function startGame() {
    trackTransforms(ctx);
    game = {alltasks:{},startage:18,maxage:35};
    var allowLoop = 1; // for easy "pause the game so I can debug state" (may never be useful again who knows)
    var allowLoad = 1; // for easy "force a state reset"
    if (allowLoad && window.localStorage.getItem("player")) {
        json = atob(window.localStorage.getItem("player"));
        player = JSON.parse(json);
    } else {
        hardReset();
    }

    registerTaskDefinition({
        taskid:"farm1",
        imageUrl:'images/farm1.png',
        repeatable:true,
        completionCosts:null,
        passiveGeneration:null,
        completionGeneration:{wheat:1},
        completionLearn:null,
        completionTools:null,
        completionYears:1,
        categories:{farming:1},
        unlock:null,
        name:"Unkept Farm",
        predescription:"You woke up this morning, and had no real memories of your life before today. You...get the sense you are a farmer? And looking out the window, it looks like there's a farm there.",
        completionstory:"Success! You got wheat! One whole wheat! What's wheat come in, anyway? Bushels? Pounds? Cartloads? These are the conversations I have with my friends now.",
        description:"Work those fields some more.",
    });

    registerTaskDefinition({
        taskid:"removestone",
        imageUrl:'images/stone.png',
        repeatable:false,
        completionCosts:null,
        passiveGeneration:null,
        completionGeneration:{stone:50},
        completionLearn:null,
        completionTools:null,
        completionYears:5,
        categories:{farming:0.5},
        unlock:{taskid: "farm1", level:4, permanent:true},
        parenttask:{taskid:"farm1"},
        hint:"Perhaps some experience farming would lead to some insight?",
        name:"Remove Stones",
        predescription:"Now that you've got some experience farming, you realize rocks kinda get in the way. Like. Really in the way. You're thinking maybe you should remove them. It'll be a lot of work, but you're pretty sure it'll pay off.",
        completionstory:"Wow, that was rough. There was this one boulder you had to dig around, took over a month and your hands were super rough. Then you had to break it up to move it in pieces. But now you have this really nice looking field. And, like. A big pile of rocks. So, that's cool.",
        description:"Not this time, little rocks. We know your game. Now, git!",
    });

    registerTaskDefinition({
        taskid:"farm2",
        imageUrl:'images/farm2.png',
        repeatable:true,
        completionCosts:null,
        passiveGeneration:{wheat:0.5},
        completionGeneration:{wheat:2},
        completionLearn:null,
        completionTools:null,
        completionYears:0.75,
        categories:{farming:1},
        unlock:{taskid:"removestone", level:1, permanent:false},
        parenttask:{taskid:"removestone"},
        hint:"Just gotta get rid of those stones...",
        name:"Actual Farm",
        predescription:"Well, I'll be gosh darned if this isn't the prettiest farm you've ever seen. Planting lines as straight as an arrow. No huge boulders in the way. Not at all half rocks instead of plants. Really, quite a sight to see. I bet this'd look real cool to a bird. Yeah, there's probably one bird up in that flock of birds overhead is all like 'wow i see a cool pattern down there guys, do you see that pattern? hey guys it's a pattern, look down, it's so cool!'",
        completionstory:"Well, not only did this generate significantly more wheat (like, literally twice as much wheat!) than your previous farm did, now that you've set it up and harvested once, it seems to just keep making wheat! Like, even more than last year, and even when you're not paying attention to it! So cool. I'm really glad you removed those rocks. Really smart idea. You should be a tactician, I think you'd be great at it. (That's definitely not foreshadowing, nope, absolutely not, no way.)",
        description:"Such farming. So wheat.",
    });

    registerTaskDefinition({
        taskid:"sellwheat",
        imageUrl:'images/sell.png',
        repeatable:true,
        passiveGeneration:null,
        completionCosts:{wheat:25},
        completionGeneration:{gold:10},
        completionLearn:null,
        completionTools:null,
        completionYears:0.5,
        categories:null,
        unlock:{resourceName:"wheat", amount:10, permanent:true},
        parenttask:{taskid:"farm1"},
        hint:"If only you had a surplus of wheat...",
        name:"Sell Wheat",
        predescription:"Okay, you're starting to build up some wheat. There's probably a merchant in the city willing to take a cartload off your hands.",
        completionstory:"It was a long, dusty road to the city, but you found a merchant looking for wheat! What luck!",
        description:"Sell that wheat!",
    });

    registerTaskDefinition({
        taskid:"trainfarming",
        imageUrl:'images/train.png',
        repeatable:false,
        passiveGeneration:null,
        completionCosts:{gold:20},
        completionGeneration:null,
        completionLearn:{farming:1},
        completionTools:null,
        completionYears:10,
        categories:{farming:1},
        unlock:{resourceName:"gold", amount:1, permanent:true},
        parenttask:{taskid:"sellwheat"},
        hint:"Wonder what you'd do with some money?",
        name:"Study Under Master Farmer",
        predescription:"While you were in the city selling your wheat, you saw an ad for a master farmer who would train up and coming farmers! It would be great to actually know how to farm instead of just kinda doing whatever? (HINT: This one's a tough one, you'll have to get really good at selling, and to do that you'd have to get really good at farming so you can spend as much time as possible selling...)",
        completionstory:"That master farmer really knew their stuff. You totally learned a lot of really cool things!",
        description:"Freshen up that farmin' skill.",
    });

    registerTaskDefinition({
        taskid:"farmingtools",
        imageUrl:'images/tools.png',
        repeatable:false,
        passiveGeneration:null,
        completionCosts:{gold:5},
        completionGeneration:null,
        completionLearn:null,
        completionTools:{farming:10},
        completionYears:0.5,
        categories:{farming:1},
        unlock:{taskid:"trainfarming", level:1, permanent:true},
        parenttask:{taskid:"trainfarming"},
        hint:"I wonder what a lifetime of training under the master would be like?",
        name:"Buy Farming Tools",
        predescription:"While the general education was great, the most valuable thing your teacher taught you was the password to the underground farming tools market. 'wheat' .......... yeah, I thought so too.",
        completionstory:"You utter that sweet, sweet phrase.... 'wheat'.... and the door swings open to a bustling panoply of carts and vendors showing off the latest and greatest in farming technology. There's a scythe store, a gloves store, some well-bred wheat seed stores... everything a farmer in whatever medieval century this is could ask for. You buy some fine tools and head back home. (next step hint: time to make some real money! ... this will go into another place in the UI once I write it but for now... :D)",
        description:"Grab those tools.",
    });

    registerTaskDefinition({
        taskid:"hirehelp",
        imageUrl:'images/hire.png',
        repeatable:false,
        passiveGeneration:{gold:25},
        completionCosts:{gold:50},
        completionGeneration:null,
        completionLearn:null,
        completionTools:null,
        completionYears:0.25,
        categories:{farming:1},
        unlock:{resourceName:"gold", amount:300, permanent:true},
        parenttask:{taskid:"farmingtools"},
        hint:"Okay, with those tools, I bet you could get even better at farming, and even better at selling, and then...man, I bet you could make... dozens of gold! No, no. Hundreds! No, no. THREE hundred! (Also, until I put in milestone popups: Tools make associated tasks complete faster, so you can get more done in your life!)",
        name:"Hire Workers",
        predescription:"You've made quite a name for yourself, and become wealthy enough that when you visit town, many strangers approach you and ask if you need any help on the farm. You'd have to build a dormitory to house them, but it'd probably pay off in a few years?",
        completionstory:"You agree to take them on, you buy the materials and head back to the farm along with some of the hired hands to build a place for your workers to live. Once it's complete, they move in and get to work extending, cleaning and working the farm, and running regular trips to the city!",
        description:"Bring on the farming team!",
    });

    registerTaskDefinition({
        taskid:"farmerapprentice",
        imageUrl:'images/teach.png',
        repeatable:false,
        passiveGeneration:{wheat:15},
        completionCosts:null,
        completionGeneration:{gold:50},
        completionLearn:null,
        completionTools:null,
        completionYears:5,
        categories:{farming:1},
        unlock:{taskid:"hirehelp", historiclevel:2, permanent:true},
        parenttask:{taskid:"hirehelp"},
        hint:"A couple lifetimes of working with hired help might lead you to a new idea?",
        name:"Adopt Apprentice",
        predescription:"You recall a neighboring peasant mentioning to you, as your workers tilled the fields in a previous life, that they'd wished you'd had the farm when their son was younger, as he'd always wanted to be an apprentice farmer... They even said they'd have paid you to take him! Well, now you know, and he's a young boy again, sooooo....",
        completionstory:"You bring on the boy, it takes time to train him, but he is an absolute joy. Hard working, productive, eager, and absolutely brilliant. With his help, you may finally have time to pursue other interests in life...",
        description:"Visit the Neighbors.",
    });

    registerTaskDefinition({
        taskid:"farmerretire",
        imageUrl:'images/retire.png',
        repeatable:false,
        passiveGeneration:null,
        completionCosts:{gold:1000},
        completionGeneration:null,
        completionLearn:null,
        completionTools:null,
        completionYears:0,
        unlock:{taskid:"farmerapprentice", historiclevel:1, permanent:true},
        parenttask:{taskid:"farmerapprentice"},
        hint:"Just, like. Do the new thing?",
        name:"Sweet Retirement",
        predescription:"Well, you did so well with that apprentice that you think, maybe, with some more practice, you could probably make enough to actually retire. Like, for realsies retire and just kinda chill out a bit. Sit in a chair for the first time in your life. Maybe learn to read. Who knows. Let's build up that nest-egg and see where life takes us.",
        completionstory:"Ahh, sweet relief. Just kickin' back and relaxin'. Turns out you saved too much, and you bet you could hand something down as an inheritance. And literally the moment you think of it, you feel something weird deep down in whatever it is that's making you live this life over and over... Wonder what it is. Maybe you won, maybe you're free!",
        description:"You can retire again. Won't change anything, but it's a nice idea.",
    });

    registerTaskDefinition({
        taskid:"inheritance",
        imageUrl:'images/inheritance.png',
        achievement:true,
        repeatable:false,
        passiveGeneration:null,
        completionCosts:null,
        completionGeneration:null,
        completionLearn:null,
        completionTools:null,
        completionYears:null,
        newlifeResources:{gold:250},
        unlock:{taskid:"farmerretire", level:1, permanent:true},
        parenttask:{taskid:"farmerretire"},
        hint:"Win farming! Do it! I believe in you!",
        name:"ACHIEVEMENT: Inheritance!",
        predescription:"While it makes no sense, having made it to retirement appears to have changed the timeline, and your future lives will all start with 250 gold! Thanks, past-me. Or, future-me? Or... uh...",
        completionstory:"ACHIEVEMENT UNLOCKED: Inheritance!",
        description:"You've already completed this achievement, you should never see this. If you do, please report it to the devs.",
    });

    registerTaskDefinition({
        taskid:"squirestart",
        imageUrl:'images/squire.png',
        repeatable:false,
        passiveGeneration:null,
        completionCosts:{gold:100},
        completionGeneration:null,
        completionLearn:null,
        completionTools:null,
        completionYears:0.25,
        unlock:{taskid:"farm2", level:20, permanent:true},
        parenttask:{taskid:"farm2"},
        hint:"You would need to be so good at farming for this. Like, it requires such a good farm, you might not even be able to do it without some kind of help.",
        name:"Become a Squire",
        predescription:"A knight passes by the growing farm and notices the strength that can only come from years of hard labor clearing a farm the hard way. \"You could handle yourself in the melee, young one,\" he comments as he heads into the city. \"Think on it.\"",
        completionstory:"You've become a squire! B hasn't written the squire story path yet, so this is the end of the line over here in squire land (but probably more to do in farmer land!). But, like. It's gonna be cool.",
        description:"I. AM. SQUIRE.",
    });

    verifyTasks();

    if (!player.age) {
        sendMessage("Welcome to the game! I won't bore you with details or story right now. Go ahead and start farming. (But, if you like story, check out the message log on the right side of the screen!)", true);
        resetPlayer();
    } else {
        refreshStats();
    }


    if (false) {
        player.resources.test=100;
        registerTaskDefinition({
            taskid:"dev",
            imageUrl:'images/dev.png',
            repeatable:true,
            completionCosts:null,
            passiveGeneration:null,
            categories:null,
            completionGeneration:{wheat:1},
            completionLearn:null,
            completionTools:{farming:10},
            completionYears:1,
            unlock:null,
            name:"Dev Test Task",
            predescription:"This shouldn't generally be in the live game, if it is let the devs know 'cause we left dev mode on.",
            completionstory:"You did a dev test!",
            description:"Just here so I can easily test new task-related features/improvements...",
        });
    }

    checkVisibleTasks();

    canvas.addEventListener('click', handleMouseClick, false);
    canvas.addEventListener('mousemove', handleMouseMove, false);
    popup.addEventListener('click', closePopup, false);

    var lastX=canvas.width/2, lastY=canvas.height/2;
    var dragStart,dragged;
    canvas.addEventListener('mousedown',function(evt){
        document.body.style.mozUserSelect = document.body.style.webkitUserSelect = document.body.style.userSelect = 'none';
        var rect = canvas.getBoundingClientRect();
        var x = event.clientX - rect.left;
        var y = event.clientY - rect.top;
        lastX = x;
        lastY = y
        dragStart = ctx.transformedPoint(lastX,lastY);
        dragged = false;
    },false);
    canvas.addEventListener('mousemove',function(evt){
        var rect = canvas.getBoundingClientRect();
        var x = event.clientX - rect.left;
        var y = event.clientY - rect.top;
        lastX = x;
        lastY = y
        dragged = true;
        if (dragStart){
            var pt = ctx.transformedPoint(lastX,lastY);
            ctx.translate(pt.x-dragStart.x,pt.y-dragStart.y);
            draw();
            needRedraw = true;
        }
    },false);
    canvas.addEventListener('mouseup',function(evt){
        dragStart = null;
//        if (!dragged) zoom(evt.shiftKey ? -1 : 1 );
    },false);

    var scaleFactor = 1.1;
    var zoom = function(clicks){
        var pt = ctx.transformedPoint(lastX,lastY);
        ctx.translate(pt.x,pt.y);
        var factor = Math.pow(scaleFactor,clicks);
        ctx.scale(factor,factor);
        ctx.translate(-pt.x,-pt.y);
        draw();
    }

    var handleScroll = function(evt){
        var delta = evt.wheelDelta ? evt.wheelDelta/40 : evt.detail ? -evt.detail : 0;
        if (delta) zoom(delta);
        return evt.preventDefault() && false;
    };
    canvas.addEventListener('DOMMouseScroll',handleScroll,false);
    canvas.addEventListener('mousewheel',handleScroll,false);
    if (allowLoop) window.requestAnimationFrame(loop)
}

var handleMouseClick = function(e) {
    var clickedTask = findClosestTask(e)
    if (clickedTask && clickedTask.history.mode=='hintmode') return;
    if (clickedTask && clickedTask.history.mode=='locked') return;
    if (clickedTask && clickedTask.history.mode=='completed') return;

    doTask(clickedTask);
}

var hoveredOverTask = null;
function handleMouseMove(e){
    hoveredOverTask = findClosestTask(e);

    if (hoveredOverTask) {
        showToolTip();
    } else { // No task, hide tooltip
        hideToolTip();
    }
}

function trackTransforms(ctx){
    var svg = document.createElementNS("http://www.w3.org/2000/svg",'svg');
    var xform = svg.createSVGMatrix();
    ctx.getTransform = function(){ return xform; };
    
    var savedTransforms = [];
    var save = ctx.save;
    ctx.save = function(){
        savedTransforms.push(xform.translate(0,0));
        return save.call(ctx);
    };
    var restore = ctx.restore;
    ctx.restore = function(){
        xform = savedTransforms.pop();
        return restore.call(ctx);
    };

    var scale = ctx.scale;
    ctx.scale = function(sx,sy){
        xform = xform.scaleNonUniform(sx,sy);
        return scale.call(ctx,sx,sy);
    };
    var rotate = ctx.rotate;
    ctx.rotate = function(radians){
        xform = xform.rotate(radians*180/Math.PI);
        return rotate.call(ctx,radians);
    };
    var translate = ctx.translate;
    ctx.translate = function(dx,dy){
        xform = xform.translate(dx,dy);
        return translate.call(ctx,dx,dy);
    };
    var transform = ctx.transform;
    ctx.transform = function(a,b,c,d,e,f){
        var m2 = svg.createSVGMatrix();
        m2.a=a; m2.b=b; m2.c=c; m2.d=d; m2.e=e; m2.f=f;
        xform = xform.multiply(m2);
        return transform.call(ctx,a,b,c,d,e,f);
    };
    var setTransform = ctx.setTransform;
    ctx.setTransform = function(a,b,c,d,e,f){
        xform.a = a;
        xform.b = b;
        xform.c = c;
        xform.d = d;
        xform.e = e;
        xform.f = f;
        return setTransform.call(ctx,a,b,c,d,e,f);
    };
    var pt = svg.createSVGPoint();
    ctx.transformedPoint = function(x,y){
        pt.x=x; pt.y=y;
        return pt.matrixTransform(xform.inverse());
    }
}
