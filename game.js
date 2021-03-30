// global context 'cause' that's how this seems to work?
var game = null;
var player = null;

// UI elements (should probably load all these in startGame() once, but the internet says one of the biggest/most common
// efficiency failures in html5 games is re-fetching DOM elements,
// so figured we should do this one particular premature optimization.
window.onresize = () => { needRedraw = true } // should this be an addeventlistener thing in game startup?

var canvasdiv = document.getElementById("canvasdiv");
var canvas = document.getElementById("canvas");
var ctx = canvas.getContext("2d");
var popupText = document.getElementById("PopupText");
var popupDiv = document.getElementById("popup");

var resourcesHeader = document.getElementById("ResourcesHeader");
var miscResourcesSpan = document.getElementById("MiscResources");
var skillsHeader = document.getElementById("SkillsHeader");
var miscSkillsSpan = document.getElementById("MiscSkills");
var toolsHeader = document.getElementById("ToolsHeader");
var miscToolsSpan = document.getElementById("MiscTools");
var totalLivesSpan = document.getElementById("TotalLives");
var dieYoungButton = document.getElementById("dieyoung");
var ageValueSpan = document.getElementById("age");
var ageLabelSpan = document.getElementById("agelabel");

var tooltip = document.getElementById("tooltip");

var oldMessagesBlock = document.getElementById("messages")
var latestMessageBlock = document.getElementById("latestMessage")
var messagesScrollBlock = document.getElementById("messagesScroll")

document.getElementById("jsv").innerHTML = "v0.03";
var needRedraw = true; // this is the "UI is dirty" flag, 'cause nobody likes games that run at 100% cpu...

//GAMESPEED_RATIO = 1 / (5 * 60 * 1000)  // 1 year every 5 minutes in ms
GAMESPEED_RATIO = 1 / (1 * 1000)  // 1 year every 1 seconds in ms
//GAMESPEED_RATIO = 1 / (1 * 100)  // 1 year every .1 seconds in ms

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
            if (game.tasks.includes(task)) return;

            var unlocked = task.def.achievement && (task.life.level > 0 || task.history.maxlevel > 0);
            if (unlocked) return; // we don't show unlocked achievements again?

            var completed = !task.def.repeatable && task.life.level > 0;

            var freebie = task.def.unlock === null;
            var active = task.life.level > 0;

            var prereqMet = false;
            if (task.def.unlock && task.def.unlock.func) {
              prereqMet = task.def.unlock.func();
            } else {
              var taskLevelPrereqMet = task.def.unlock !== null && (task.def.unlock.taskid && task.def.unlock.level && game.alltasks[task.def.unlock.taskid].life.level >= task.def.unlock.level);
              var resourcePrereqMet = task.def.unlock !== null && (task.def.unlock.resourceName && player.resources[task.def.unlock.resourceName] >= task.def.unlock.amount);
              var historicTaskLevelPrereqMet = task.def.unlock !== null && (task.def.unlock.taskid && task.def.unlock.historiclevel && game.alltasks[task.def.unlock.taskid].history.maxlevel >= task.def.unlock.historiclevel);
              var parentTasksAndUnlock = task.def.unlock !== null && (task.def.unlock.completedtasksand && task.def.unlock.completedtasksand.map((taskid) => game.alltasks[taskid].history.maxlevel > 0 || game.alltasks[taskid].life.level > 0).reduce((r,c)=>r&&c, true));
              prereqMet = taskLevelPrereqMet || resourcePrereqMet || historicTaskLevelPrereqMet || parentTasksAndUnlock;
            }

            var permanentPreviousLive = (task.def.unlock !== null) && task.def.unlock.permanent && task.history.everlive;

            var actuallyVisible = freebie || active || prereqMet || permanentPreviousLive;

            var parenttaskHint = task.def.parenttask && game.alltasks[task.def.parenttask.taskid].history.seen && !(game.alltasks[task.def.parenttask.taskid].history.mode=='hintmode');
            var parenttasksorHint = task.def.parenttasksor && task.def.parenttasksor.map((taskid) => game.alltasks[taskid].history.seen && !(game.alltasks[taskid].history.mode=='hintmode')).reduce((r,c)=>r||c, false);
            var hintmode = !task.def.nohint && (parenttaskHint || parenttasksorHint);
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
                    offsettask = task.def.parenttask ? game.alltasks[task.def.parenttask.taskid] : task.def.unlock && task.def.unlock.taskid ? game.alltasks[task.def.unlock.taskid] : null;
                    if (offsettask) {
                        task.history.x = offsettask.history.x + (task.def.parentoffset ? task.def.parentoffset.x : 60);
                        task.history.y = offsettask.history.y + (task.def.parentoffset ? task.def.parentoffset.y : 0);
                    } else {
                        task.history.x = player.history.nextMiscX;
                        task.history.y = (player.history.nextMiscY += 60);
                    }
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
                if (!player.milestones.firstSkill) {
                    sendMessage(game.milestones.firstSkill, true);
                    player.milestones.firstSkill = 1;
                }

                player.skills[skill] = 0;
            }
            player.skills[skill] += task.def.completionLearn[skill];
        }
    }

    if (task.def.completionTools != null) {
        for (tool in task.def.completionTools) {
            if (!player.tools[tool]) {
                if (!player.milestones.firstTool) {
                    sendMessage(game.milestones.firstTool, true);
                    player.milestones.firstTool = 1;
                }
                player.tools[tool] = 0;
            }
            player.tools[tool] += task.def.completionTools[tool];
        }
    }

    task.life.level++;

    if (!task.history.evercompleted) {
        if (!player.milestones.firstAchievement && task.def.achievement) {
            sendMessage(game.milestones.firstAchievement, true);
            player.milestones.firstAchievement = 1;
        }
        sendMessage(task.def.name + ":<br/><i>" + task.def.predescription + "</i><br/>Result: " + task.def.completionstory, false);
        task.history.evercompleted = true;
    }

    // the important part of a completed task is checking if new tasks are unlocked
    // (one day this might happen outside of task completion/game init 'cause who tf knows what would cause unlocks? maybe?)
    checkVisibleTasks();
}

function _canDoTask(task, sendmsg = false) {
    if (task === null) return false;
    if (player.activetaskid !== null) return false;
    if (!task.def.repeatable && task.level > 0) return false;

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
            if (sendmsg) sendMessage("Not enough resources!", false);
            return false;
        }
    }

    return true;
}

var doTask = function(task) {
    if (!_canDoTask(task, true)) return;

    if (!player.milestones.firstImprovedRepeatable && task.def.repeatable && (task.history.maxlevel > 0)) {
        sendMessage(game.milestones.firstImprovedRepeatable, true);
        player.milestones.firstImprovedRepeatable = 1;
    }

    if (task.def.completionCosts) {
        Object.entries(task.def.completionCosts).forEach((e)=> {
            resource = e[0];
            amount = computeCompletionCost(task,e[1]);
            player.resources[resource] -= amount;
        });
    }

    player.activetaskid = task.def.taskid;
    task.life.yearsWorked = 0;
}


// new idea: Keep last X messages, and a "most recent message count", only keep messages back 10. We need a real "show the whole story" UI anyway.
var lastMessage = null;
var repeatMessageCount = 0;
function sendMessage(text, popup) {
    if (popup) {
        popupText.innerHTML = text;
        popupDiv.style.display="block";
        var position = 1;
        var timePerShift = 8;
        var shiftSize = 2;
        interval = setInterval(function () {
            position += shiftSize;
            popupDiv.style.top = (position - popupDiv.offsetHeight) +  "px";
        }, timePerShift);
                
        var numTicks = (popupDiv.offsetHeight + 20) / shiftSize;
        var dropTime = timePerShift * numTicks;
        setTimeout(function () {clearInterval(interval);}, dropTime);
    }

    if (lastMessage === text) {
        repeatMessageCount++;
    } else {
        if (lastMessage != null) oldMessagesBlock.innerHTML = (oldMessagesBlock.innerHTML || "") + "<br/>" + lastMessage + (repeatMessageCount > 1 ? ("(" + repeatMessageCount + ")") : "") + "<br/>";
        repeatMessageCount = 1;
    }

    latestMessageBlock.innerHTML = "<br/>" + text + (repeatMessageCount > 1 ? ("(" + repeatMessageCount + ")") : "");
    lastMessage = text;

    messagesScrollBlock.scrollTo(0,99999999);
}

function closePopup() {
    popupDiv.style.display="none";
    draw();
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
    if (description) {
        if (!player.milestones.firstDeath) {
            sendMessage(game.milestones.firstDeath, true);
            player.milestones.firstDeath = 1;
        } else sendMessage(description, true);
    }

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
    player.activetaskid = null
    resetPlayer();
    save();
    needRedraw = true;
}

function save() {
    window.localStorage.setItem("player", btoa(JSON.stringify(player)));
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
        dieYoungButton.style.display = "inline";
        totalLivesSpan.innerHTML = " (life #" + (player.pastlives + ")");
    } else {
        dieYoungButton.style.display = "none";
    }

    // how should we order these? Most recently gained? Manual list? Alphabetical? Most-owned? order-originally-seen maintained over history, with maybe optional reordering?
    var miscResourcesSpanInnerHTML = "";
    for (resource in player.resources) {
        miscResourcesSpanInnerHTML += resource + ": " + Math.round(player.resources[resource] * 10) / 10 + "</br>";
    }
    if (miscResourcesSpanInnerHTML == "") {
        resourcesHeader.style.display = "none";
    } else {
        resourcesHeader.style.display = "block";
    }
    miscResourcesSpan.innerHTML = miscResourcesSpanInnerHTML;

    var miscSkillsSpanInnerHTML = "";
    for (skill in player.skills) {
        miscSkillsSpanInnerHTML += skill + ": " + Math.round(player.skills[skill] * 10) / 10 + "</br>";
    }
    if (miscSkillsSpanInnerHTML == "") {
        skillsHeader.style.display = "none";
    } else {
        skillsHeader.style.display = "block";
    }
    miscSkillsSpan.innerHTML = miscSkillsSpanInnerHTML;

    var miscToolsSpanInnerHTML = "";
    for (tool in player.tools) {
        miscToolsSpanInnerHTML += tool + ": " + Math.round(player.tools[tool] * 10) / 10 + "</br>";
    }
    if (miscToolsSpanInnerHTML == "") {
        toolsHeader.style.display = "none";
    } else {
        toolsHeader.style.display = "block";
    }
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
            killPlayer("You died of old age (it was a harsher time...) - and yet, you live again...");
        }
    }
    refreshStats();
    if (shouldSave) save();
}

var hintImage = new Image();
hintImage.onload = function() { needRedraw = true; }
hintImage.src = "images/hint_icon.png"
var lockImage = new Image();
lockImage.onload = function() { needRedraw = true; }
lockImage.src = "images/lock.png"

var storylineColors = {
  farmer:{border:"Sienna", availableBackground:"SandyBrown", unavailableBackground:"SaddleBrown", textColor:"Black"},
  squire:{border:"SteelBlue", availableBackground:"SkyBlue", unavailableBackground:"SlateBlue", textColor:"Black"},
  dev:{border:"Red", availableBackground:"Red", unavailableBackground:"Red", textColor:"Black"},
}

function draw() {
    needRedraw = false;

    var oldW = canvas.width;
    var oldH = canvas.height;

    // we reset this every time because it resets the context, which we scale/translate every time.
    canvas.width = Math.min(window.innerWidth-299, canvasdiv.offsetWidth-1);
    canvas.height = Math.min(window.innerHeight,canvasdiv.offsetHeight-1);

    if (canvas.width != oldW || canvas.height != oldH) {
        needRedraw = true;
    }

    ctx.translate(player.history.camtransx, player.history.camtransy);
    ctx.scale(player.history.camscale, player.history.camscale);

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

        if (task.history.mode=='locked' || task.history.mode=='completed' || popupDiv.style.display!="none") {
            ctx.globalAlpha = 0.8
            ctx.beginPath();
            ctx.fillStyle = "#222222";
            ctx.moveTo(task.history.x, task.history.y);
            ctx.lineTo(task.history.x, task.history.y + 25);
            ctx.arc(task.history.x, task.history.y, 25, -0.5*Math.PI, 2 * Math.PI - 0.5*Math.PI, true);
            ctx.lineTo(task.history.x, task.history.y);
            ctx.fill();
            ctx.globalAlpha = 1
        }

        if (task.history.mode=='locked') {
            ctx.fillStyle = "#222222";
            ctx.drawImage(lockImage, task.history.x, task.history.y, 25, 25);
            ctx.globalAlpha = 1
        }

        if (task.history.mode=='completed') {
            ctx.globalAlpha = 0.6
            ctx.beginPath();
            ctx.fillStyle = "#222222";
            ctx.moveTo(task.history.x-5, task.history.y+10);
            ctx.lineTo(task.history.x+10, task.history.y+20);
            ctx.lineTo(task.history.x+20, task.history.y-5);
            ctx.lineWidth = 10;
            ctx.strokeStyle = '#00AA00';
            ctx.stroke();
            ctx.globalAlpha = 1
        }

        if (task.def.taskid === player.activetaskid) {
            var pctComplete = task.life.yearsWorked / computeCompletionYears(task);

            ctx.globalAlpha = 0.3
            ctx.beginPath();
            ctx.fillStyle = "#AAAAAA";
            ctx.moveTo(task.history.x, task.history.y);
            ctx.lineTo(task.history.x, task.history.y + 25);
            ctx.arc(task.history.x, task.history.y, 25, -0.5*Math.PI, 2 * Math.PI * pctComplete - 0.5*Math.PI, true);
            ctx.lineTo(task.history.x, task.history.y);
            ctx.fill();
            ctx.globalAlpha = 1
        }

        var taskIsAvailable = _canDoTask(task);
        if (task.history.mode=='locked' || task.history.mode=='completed' || task.history.mode=='hintmode') taskIsAvailable = false;
        var textHeight = 8
        var halfHeight = textHeight / 2
        if (task.history.mode!='hintmode') {
            ctx.beginPath();
            ctx.fillStyle = storylineColors[task.def.storyline][(taskIsAvailable ? "availableBackground" : "unavailableBackground")]; // or unavailableBackground
            ctx.moveTo(task.history.x - 25 + halfHeight, task.history.y - 24 - textHeight);
            ctx.lineTo(task.history.x + 25 - halfHeight, task.history.y - 24 - textHeight);
            ctx.arc(task.history.x + 25 - halfHeight, task.history.y - 24 - halfHeight, halfHeight, 1.5*Math.PI, 0.5*Math.PI, false);
            ctx.lineTo(task.history.x - 25 + halfHeight, task.history.y - 24);
            ctx.arc(task.history.x - 25 + halfHeight, task.history.y - 24 - halfHeight, halfHeight, 1.5*Math.PI, 0.5*Math.PI, true);
            ctx.fill();

            ctx.font = textHeight + "px Open Sans MS";
            ctx.fillStyle = storylineColors[task.def.storyline].textColor;
            ctx.textAlign = "center";
            ctx.textBaseline = "alphabetic";
            var displayName = task.def.name;
            while (ctx.measureText(displayName).width > 45) {displayName = displayName.substring(displayName, displayName.length-4)+"..."}
            ctx.fillText(displayName, task.history.x, task.history.y-25);
        }

        if (task.history && task.history.maxlevel && task.history.maxlevel > 0) {
            // historic number in bottom right corner
            ctx.beginPath();
            ctx.fillStyle = storylineColors[task.def.storyline][(taskIsAvailable ? "availableBackground" : "unavailableBackground")]; // or unavailableBackground
            ctx.moveTo(task.history.x + 25 - textHeight, task.history.y + 25);
            ctx.ellipse(task.history.x + 25 - halfHeight, task.history.y + 25 - textHeight, halfHeight*2, halfHeight*1.1, 0, 0, 2 * Math.PI, true);
            ctx.fill();

            ctx.font = textHeight + "px Open Sans MS";
            ctx.fillStyle = storylineColors[task.def.storyline].textColor;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(task.history.maxlevel, task.history.x + 25 - halfHeight, task.history.y + 25 - textHeight+1);
        }
        if (task.life && task.life.level && task.life.level > 0 || task.history && task.history.maxlevel && task.history.maxlevel > 0) {
            ctx.beginPath();
            ctx.fillStyle = storylineColors[task.def.storyline][(taskIsAvailable ? "availableBackground" : "unavailableBackground")]; // or unavailableBackground
            ctx.moveTo(task.history.x + 25 - textHeight, task.history.y - 25);
            ctx.ellipse(task.history.x + 25 - halfHeight, task.history.y - 25 + textHeight, halfHeight*2, halfHeight*1.1, 0, 0, 2 * Math.PI, true);
            ctx.fill();

            ctx.font = textHeight + "px Open Sans MS";
            ctx.fillStyle = storylineColors[task.def.storyline].textColor;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(task.life.level, task.history.x + 25 - halfHeight, task.history.y - 25 + textHeight+1);
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

    x = x - player.history.camtransx;
    y = y - player.history.camtransy;

    x = x / player.history.camscale;
    y = y / player.history.camscale;

    var closestTask = null;
    var closestClick = 25.1;

    game.tasks.forEach(task => {
        xd = task.history.x - x;
        yd = task.history.y - y;
        d = Math.sqrt(xd*xd+yd*yd)

        if (d < 25.1 && closestTask != null) {
            console.log("WARNING: overlapping tasks! " + task.def.name + " vs. " + closestTask.def.name);
        }

        if (d < closestClick) {
            closestClick = d;
            closestTask = task;
        }
    });
    return closestTask;
}

function updateTooltipText() {
    needRedraw = true; // i was getting sick of my CPU running at 100%, so game updates don't trigger draw updates if they don't need to?

    if (!hoveredOverTask)
    {
        hideToolTip();
        return;
    }

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
    game.tasks = {};
    player = {tasks:{},resources:{},skills:{},tools:{},activetaskid:null,milestones:{},history:{nextMiscX:300,nextMiscY:100,camscale:2,camtransx:-500,camtransy:-250,skills:{},tools:{}}}
    Object.entries(game.alltasks).forEach(e => {
        var task = e[1];
        task.life = {level:0};
        task.history = {maxlevel:0};
        var playertask = {life:task.life, history:task.history};
        player.tasks[task.taskid] = playertask;
    });
    killPlayer();
    refreshStats();
}

function resetGame() {
    game = {alltasks:{},startage:18,maxage:35};
    game.milestones = {
        firstDeath:"Well, congratulations, you died! Generally speaking in this game, death is progression. Now you get to live your life again, but you know so much more about the things you spent your last life working on. For instance, you won't need to spend four years farming a stone-filled field, you can dive straight into clearing out those pesky stones! So many more years to spend on that stone-free farmland!",
        firstImprovedRepeatable:"Okay, so, here's a quick overview of what we're calling groundhog bonuses. The highest level you've ever gotten a given task in a <b>previous life</b> improves your ability with the task. Sometimes, the tasks will take less time. Sometimes, they will produce more resources. Sometimes, they will cost fewer resources. Sometimes? All three! So, maybe it's a good time to learn how to farm that stone-free farm <b>really</b> well! You know. For future yous.",
        firstSkill:"You've learned a skill! Skills work slightly differently from our standard task groundhog progression. <br/>First, and most importantly, they impact <b>all</b> tasks that are related to the skill. The <i>farming</i> skill will improve every farming task you do. (That includes farms, moving stones, or even selling wheat! (I imagine it as, like, better looking wheat bundles thanks to your amazing tools, so they just fly off the shelves?)) <br/>Second, skills <b>only</b> increase the <b>resources produced</b> by the task.<br/>And third, the skills impact you in the same life you learn them, and you will start each life with 10% of the max-ever-skill. This is very different from task-specific groundhog bonuses! <br/>Last, if you get skills repeatedly (even from different sources/tasks), they will add up. Use that to your advantage!",
        firstTool:"Ooo, tools! Tools are, yet again, unique from skills and groundhog bonuses. <br/>First, tools, like skills, improve all tasks that are related to the tool - so farming tools improve all farming tasks. <br/>Second, and probably most important, tools have <b>no restart bonus</b> (you don't magically start a new life with tools just because you had them in a past life!) <br/>Third, tools <b>only</b> reduce the <b>time taken</b> to execute a task! A 1 acre farm will produce the same amount of wheat whether you're doing it by hand or with a scythe, but you will spend a lot less time with the tool. At least, that's the idea. Let's not be too nitpicky or pedantic here. <br/>Last, tools do not add up. Getting a dull scythe does not help you if you already have a sharp one, and having a dull scythe before you find a sharp one doesn't make the sharp one better! So, keep that in mind if you've got multiple options for tools!",
        firstAchievement:"ACHIEVEMENT UNLOCKED! In this game, achievements are permanent, logic-defying, story-breaking bonuses that will impact every life you ever live after unlocking them. Generally, you will get them for completing a story line, or doing something silly, etc. Some achievements are even hidden (no hint guiding the way!) - enjoy your reward!"
    };
    var allowLoad = 1; // for easy "force a state reset"
    if (allowLoad && window.localStorage.getItem("player")) {
        var json = null;
        try {
            json = atob(window.localStorage.getItem("player"));
            // TODO : probably want to, like, save their progress and fix our failed version upgrade process in V2+?
            player = JSON.parse(json);
            if (!player.milestones) player.milestones = {};
        } catch(err) {
            hardReset();
        }
    } else {
        hardReset();
    }

    registerTaskDefinition({
        storyline:"farmer",
        taskid:"farm1",
        imageUrl:'images/farm1_icon.png',
        repeatable:true,
        completionCosts:null,
        passiveGeneration:null,
        completionGeneration:{wheat:1},
        completionLearn:null,
        completionTools:null,
        completionYears:1,
        categories:{farming:1},
        unlock:null,
        name:"Wheat",
        predescription:"You woke up this morning, and had no real memories of your life before today. You...get the sense you are a farmer? And looking out the window, it looks like there's a farm there. So. There's that.",
        completionstory:"Success! You got wheat! One whole wheat! What's wheat come in, anyway? Bushels? Pounds? Cartloads? These are the conversations I have with my friends now. I'm going with units. One unit of wheat. You're welcome.",
        description:"Work those fields some more.",
    });

    registerTaskDefinition({
        storyline:"farmer",
        taskid:"removestone",
        imageUrl:'images/stone_icon.png',
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
        name:"Clear Rocks",
        predescription:"Now that you've got some experience farming, you realize rocks kinda get in the way. Like. Really in the way. You're thinking maybe you should remove them. It'll be a lot of work, but you're pretty sure it'll pay off.",
        completionstory:"Wow, that was rough. There was this one boulder you had to dig around, took over a month and your hands were super rough. Then you had to break it up to move it in pieces. But now you have this really nice looking field. And, like. A big pile of rocks. So, that's cool.",
        description:"Not this time, little rocks. We know your game. Now, git!",
    });

    registerTaskDefinition({
        storyline:"farmer",
        taskid:"farm2",
        imageUrl:'images/farm2_icon.png',
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
        name:"More Wheat",
        predescription:"Well, I'll be gosh darned if this isn't the prettiest farm you've ever seen. Planting lines as straight as an arrow. No huge boulders in the way. Not at all half rocks instead of plants. Really, quite a sight to see. I bet this'd look real cool to a bird. Yeah, there's probably one bird up in that flock of birds overhead is all like 'wow i see a cool pattern down there guys, do you see that pattern? hey guys it's a pattern, look down, it's so cool!'",
        completionstory:"Well, not only did this generate significantly more wheat (like, literally twice as much wheat!) than your previous farm did, now that you've set it up and harvested once, it seems to just keep making wheat! Like, even more than last year, and even when you're not paying attention to it! So cool. I'm really glad you removed those rocks. Really smart idea. You should be a tactician, I think you'd be great at it. (That's definitely not foreshadowing, nope, absolutely not, no way.)",
        description:"Such farming. So wheat.",
    });

    registerTaskDefinition({
        storyline:"farmer",
        taskid:"sellwheat",
        imageUrl:'images/sell_icon.png',
        repeatable:true,
        passiveGeneration:null,
        completionCosts:{wheat:25},
        completionGeneration:{gold:10},
        completionLearn:null,
        completionTools:null,
        completionYears:0.5,
        categories:null,
        unlock:{resourceName:"wheat", amount:10, permanent:true},
//        parenttask:{taskid:"farm1"},
        hint:"If only you had a surplus of wheat...",
        name:"Sell Wheat",
        predescription:"Okay, you're starting to build up some wheat. There's probably a merchant in the city willing to take a cartload off your hands.",
        completionstory:"It was a long, dusty road to the city, but you found a merchant looking for wheat! What luck!",
        description:"Sell that wheat!",
    });

    registerTaskDefinition({
        storyline:"farmer",
        taskid:"trainfarming",
        imageUrl:'images/train_icon.png',
        repeatable:false,
        passiveGeneration:null,
        completionCosts:{gold:20},
        completionGeneration:null,
        completionLearn:{farming:1},
        completionTools:null,
        completionYears:10,
        categories:{farming:1},
        unlock:{resourceName:"gold", amount:1, permanent:true},
//        parenttask:{taskid:"sellwheat"},
        hint:"Wonder what you'd do with some money?",
        name:"Master",
        predescription:"While you were in the city selling your wheat, you saw an ad for a master farmer who would train up and coming farmers! It would be great to actually know how to farm instead of just kinda doing whatever? (HINT: This one's a tough one, you'll have to get really good at selling, and to do that you'd have to get really good at farming so you can spend as much time as possible selling...)",
        completionstory:"That master farmer really knew their stuff. You totally learned a lot of really cool things!",
        description:"Freshen up that farmin' skill.",
    });

    registerTaskDefinition({
        storyline:"farmer",
        taskid:"farmingtools",
        imageUrl:'images/tools_icon.png',
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
        name:"Buy Tools",
        predescription:"While the general education was great, the most valuable thing your teacher taught you was the password to the underground farming tools market. 'wheat' .......... yeah, I thought so too.",
        completionstory:"You utter that sweet, sweet phrase.... 'wheat'.... and the door swings open to a bustling panoply of carts and vendors showing off the latest and greatest in farming technology. There's a scythe store, a gloves store, some well-bred wheat seed stores... everything a farmer in whatever medieval century this is could ask for. You buy some fine tools and head back home. (next step hint: time to make some real money! ... this will go into another place in the UI once I write it but for now... :D)",
        description:"Grab those tools.",
    });

    registerTaskDefinition({
        storyline:"farmer",
        taskid:"hirehelp",
        imageUrl:'images/hire_icon.png',
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
        parentoffset:{x:-60,y:60},
        hint:"Okay, with those tools, I bet you could get even better at farming, and even better at selling, and then...man, I bet you could make... dozens of gold! No, no. Hundreds! No, no. THREE hundred!",
        name:"Hire Workers",
        predescription:"You've made quite a name for yourself, and become wealthy enough that when you visit town, many strangers approach you and ask if you need any help on the farm. You'd have to build a dormitory to house them, but it'd probably pay off in a few years?",
        completionstory:"You agree to take them on, you buy the materials and head back to the farm along with some of the hired hands to build a place for your workers to live. Once it's complete, they move in and get to work extending, cleaning and working the farm, and running regular trips to the city!",
        description:"Bring on the farming team!",
    });

    registerTaskDefinition({
        storyline:"farmer",
        taskid:"farmerapprentice",
        imageUrl:'images/teach_icon.png',
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
        name:"Apprentice",
        predescription:"You recall a neighboring peasant mentioning to you, as your workers tilled the fields in a previous life, that they'd wished you'd had the farm when their son was younger, as he'd always wanted to be an apprentice farmer... They even said they'd have paid you to take him! Well, now you know, and he's a young boy again, sooooo....",
        completionstory:"You bring on the boy, it takes time to train him, but he is an absolute joy. Hard working, productive, eager, and absolutely brilliant. With his help, you may finally have time to pursue other interests in life...",
        description:"Visit the Neighbors.",
    });

    registerTaskDefinition({
        storyline:"farmer",
        taskid:"farmerretire",
        imageUrl:'images/retire_icon.png',
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
        name:"Retirement",
        predescription:"Well, you did so well with that apprentice that you think, maybe, with some more practice, you could probably make enough to actually retire. Like, for realsies retire and just kinda chill out a bit. Sit in a chair for the first time in your life. Maybe learn to read. Who knows. Let's build up that nest-egg and see where life takes us.",
        completionstory:"Ahh, sweet relief. Just kickin' back and relaxin'. Turns out you saved too much, and you bet you could hand something down as an inheritance. And literally the moment you think of it, you feel something weird deep down in whatever it is that's making you live this life over and over... Wonder what it is. Maybe you won, maybe you're free!",
        description:"You can retire again. Won't change anything, but it's a nice idea.",
    });

    registerTaskDefinition({
        storyline:"farmer",
        taskid:"inheritance",
        imageUrl:'images/cheivo_icon.png',
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
        name:"Inheritance!",
        predescription:"ACHIEVEMENT! While it makes no sense, having made it to retirement appears to have changed the timeline, and your future lives will all start with 250 gold! Thanks, past-me. Or, future-me? Or... uh...",
        completionstory:"ACHIEVEMENT UNLOCKED: Inheritance!",
        description:"You've already completed this achievement, you should never see this. If you do, please report it to the devs.",
    });

    registerTaskDefinition({
        storyline:"farmer",
        taskid:"nostone",
        imageUrl:'images/cheivo_icon.png',
        achievement:true,
        repeatable:false,
        passiveGeneration:null,
        completionCosts:null,
        completionGeneration:null,
        completionLearn:null,
        completionTools:null,
        completionYears:null,
        newlifeResources:{wheat:50},
        unlock:{permanent:true, func:function() { return player.tasks["farm1"].life.level > 10 && player.tasks["removestone"].life.level == 0 && player.tasks["removestone"].history.maxlevel > 2 }},
        parenttask:{taskid:"farm1"},
        parentoffset:{x:60,y:60},
        nohint:true,
        name:"Commitment!",
        predescription:"ACHIEVEMENT! Such commitment to your run down, tiny, not very good farm... you get a SECRET ACHIEVEMENT! I'm not actually sure if I like the idea of secret achievements yet, but this is how we learn! Your love and commitment to this almost completely useless farm has instilled in future yous a deeper understanding of farming earlier in life, and you will now start runs with 50 wheat. Wow, living multiple lives has so many benefits!",
        completionstory:"ACHIEVEMENT UNLOCKED: Commitment!",
        description:"You've already completed this achievement, you should never see this. If you do, please report it to the devs.",
    });

    registerTaskDefinition({
        storyline:"farmer",
        taskid:"muchmaster",
        imageUrl:'images/cheivo_icon.png',
        achievement:true,
        repeatable:false,
        passiveGeneration:null,
        completionCosts:null,
        completionGeneration:{narwhal:1},
        completionLearn:null,
        completionTools:null,
        completionYears:null,
        newlifeResources:{narwhal:1},
        unlock:{permanent:true, func:function() { return player.tasks["trainfarming"].history.maxlevel > 3 }},
        parenttask:{taskid:"farm1"},
        parentoffset:{x:60,y:60},
        nohint:true,
        name:"Why Not!",
        predescription:"ACHIEVEMENT! Okay, seriously - let's go over how skills work again - you only keep 10% when you die, so, like, you're really pushing hard, here, for, like, what, 0.1% boost? 100% -> 10% -> 110% -> 11% -> 111% -> 11.1%..... yeah, I think... like... There's gotta be something better to do, right? All the same, here. Have an achievement. I guess. Hmm, what do you deserve for this. Ah, I've got it! A pet narwhal. No, it doesn't do anything, but it does show up in your inventory! You're welcome.",
        completionstory:"ACHIEVEMENT UNLOCKED: Why Not!",
        description:"You've already completed this achievement, you should never see this. If you do, please report it to the devs.",
    });

    registerTaskDefinition({
        storyline:"squire",
        taskid:"squire",
        imageUrl:'images/squire2_icon.png',
        repeatable:false,
        passiveGeneration:null,
        completionCosts:{gold:100},
        completionGeneration:null,
        completionLearn:null,
        completionTools:null,
        completionYears:0.25,
        categories:null,
        unlock:{taskid:"farm2", historiclevel:20, permanent:true},
        parenttask:{taskid:"farm2"},
        parentoffset:{x:180,y:0},
        name:"Squire",
        hint:"You would need to be so good at farming for this. Like, it requires such a good farm, you might not even be able to do it without some kind of help.",
        predescription:"A knight passes by the growing farm and notices the strength that can only come from years of hard labor clearing a farm the hard way. \"You could handle yourself in the melee, young one,\" he comments as he heads into the city. \"Think on it.\"",
        completionstory:"Squiring is hard work, but somebody has to do it, B write more story here",
        description:"Drudge away future Ser!",
    });
    registerTaskDefinition({
        storyline:"squire",
        taskid:"swords",
        imageUrl:'images/swords_icon.png',
        repeatable:false,
        passiveGeneration:null,
        completionCosts:null,
        completionGeneration:null,
        completionLearn:null,
        completionTools:null,
        completionYears:5,
        categories:null,
        unlock:{taskid:"squire", level:1, permanent:true},
        parenttask:{taskid:"squire"},
        parentoffset:{x:-60,y:60},
        name:"Swords",
        hint:"Once you are a Squire...",
        predescription:"A knight must understand how to wield and ultimately defend against all manner of blades.",
        completionstory:"You understand a little bit more about swordplay. Man these things are HEAVY!",
        description:"You focus your time on different types of blades, begin to understand the training path ahead of you.",
    });
    registerTaskDefinition({
        storyline:"squire",
        taskid:"etiquette",
        imageUrl:'images/etiquette_icon.png',
        repeatable:false,
        passiveGeneration:null,
        completionCosts:{skill:100, horses:100},
        completionGeneration:null,
        completionLearn:null,
        completionTools:null,
        completionYears:5,
        categories:null,
        unlock:{completedtasksand:["skill","horses"]},
        parenttask:{taskid:"squire"},
        parentoffset:{x:0,y:60},
        name:"Etiquette",
        hint:"Once you are a Squire...",
        predescription:"A knight must understand how to navigate the delicate social web of nobility.",
        completionstory:"You understand almost nothing about etiquette other than it is hard to say, harder to spell and confusing.",
        description:"You focus your time on comprehending the rules behind these silly approaches to life those in the court uphold.",
    });
    registerTaskDefinition({
        storyline:"squire",
        taskid:"drudgery",
        imageUrl:'images/drudgery_icon.png',
        repeatable:false,
        passiveGeneration:null,
        completionCosts:null,
        completionGeneration:null,
        completionLearn:null,
        completionTools:null,
        completionYears:5,
        categories:null,
        unlock:{taskid:"squire", level:1, permanent:true},
        parenttask:{taskid:"squire"},
        parentoffset:{x:60,y:60},
        name:"Drudgery",
        hint:"Once you are a Squire...",
        predescription:"A Squire must do all sorts of nonsense for his Knight.  It will be worth it.  Hopefully.",
        completionstory:"You understand a little bit more about what sort of nonsense your new life entails",
        description:"You focus your time on chasing the never ending tasks set you by your Knight.",
    });
    registerTaskDefinition({
        storyline:"squire",
        taskid:"strength",
        imageUrl:'images/strength_icon.png',
        repeatable:true,
        passiveGeneration:null,
        completionCosts:null,
        completionGeneration:{strength:100},
        completionLearn:null,
        completionTools:null,
        completionYears:0.5,
        categories:{swords:1},
        unlock:{taskid:"swords", level:1, permanent:true},
        parenttask:{taskid:"swords"},
        parentoffset:{x:0,y:60},
        name:"Strength",
        hint:"Slice and Dice...",
        predescription:"Moving all this metal around will surely make this training easier over time",
        completionstory:"Man these things are HEAVY!",
        description:"Picking things up and putting them down, ie the old fashioned way to get stronger.",
    });
    registerTaskDefinition({
        storyline:"squire",
        taskid:"rules",
        imageUrl:'images/rules_icon.png',
        repeatable:true,
        passiveGeneration:null,
        completionCosts:null,
        completionGeneration:{rules:100},
        completionLearn:null,
        completionTools:null,
        completionYears:0.5,
        categories:null,
        unlock:{taskid:"etiquette", level:1, permanent:true},
        parenttask:{taskid:"etiquette"},
        parentoffset:{x:0,y:60},
        name:"Rules",
        hint:"Requires being fancy...",
        predescription:"A knight must understand how to navigate the delicate social web of nobility.",
        completionstory:"Rules, rules, and more rules. Here you were thinking  you were here to fight.",
        description:"One fork placement and silly bow at a time you will learn to navigate the courts like a Earl.",
    });
    registerTaskDefinition({
        storyline:"squire",
        taskid:"armor",
        imageUrl:'images/armor_icon.png',
        repeatable:true,
        passiveGeneration:null,
        completionCosts:null,
        completionGeneration:{armor:100},
        completionLearn:null,
        completionTools:null,
        completionYears:0.5,
        categories:{drudgery:1},
        unlock:{taskid:"drudgery", level:1, permanent:true},
        parenttask:{taskid:"drudgery"},
        parentoffset:{x:0,y:60},
        name:"Armor",
        hint:"What a chore...",
        predescription:"A Squire must do all sorts of nonsense for his Knight.  First, clean and assemble their armor.",
        completionstory:"You understand a little bit more about how to put on this complicated outfit",
        description:"Only by taking it apart and cleaning it will you know how it really works.",
    });
    registerTaskDefinition({
        storyline:"squire",
        taskid:"skill",
        imageUrl:'images/skill_icon.png',
        repeatable:true,
        passiveGeneration:null,
        completionCosts:null,
        completionGeneration:{skill:100},
        completionLearn:null,
        completionTools:null,
        completionYears:0.5,
        categories:{swords:1},
        unlock:{taskid:"strength", level:1, permanent:true},
        parenttask:{taskid:"strength"},
        parentoffset:{x:0,y:60},
        name:"Skill",
        hint:"Strength is not enough...",
        predescription:"Once you are strong enough to lift a blade you might be able to start in on wielding it properly",
        completionstory:"You understand a little bit more about where to stick the pointy end",
        description:"You focus your time on moving through the forms.",
    });
    registerTaskDefinition({
        storyline:"squire",
        taskid:"finesse",
        imageUrl:'images/finesse_icon.png',
        repeatable:true,
        passiveGeneration:null,
        completionCosts:{skill:50},
        completionGeneration:{finesse:100},
        completionLearn:null,
        completionTools:null,
        completionYears:0.5,
        categories:{etiquette:1},
        unlock:{taskid:"rules", level:1, permanent:true},
        parenttask:{taskid:"rules"},
        parentoffset:{x:0,y:60},
        name:"Society",
        hint:"Do you know the rules?",
        predescription:"A knight must understand how to navigate the delicate social web of nobility.",
        completionstory:"You thought etiquette was hard to spell and here we go with finesse...",
        description:"Once you put the ee in \"finesse\" you will surely win the approval of your knight.",
    });
    registerTaskDefinition({
        storyline:"squire",
        taskid:"horses",
        imageUrl:'images/horses_icon.png',
        repeatable:true,
        passiveGeneration:null,
        completionCosts:{skill:50, armor:50},
        completionGeneration:{horses:100, strength:100},
        completionLearn:null,
        completionTools:null,
        completionYears:0.5,
        categories:{drudgery:1},
        unlock:{completedtasksand:["strength","armor"]},
        parenttask:{taskid:"armor"},
        parentoffset:{x:0,y:60},
        name:"Horses",
        hint:"This needs two...",
        predescription:"Caring for horses is harddddd work.",
        completionstory:"You smell, you ache, but it was worth it - look at that horsey shine!",
        description:"The proper care and handling of a horse will make or break a Squire.",
    });
    registerTaskDefinition({
        storyline:"squire",
        taskid:"knight",
        imageUrl:'images/knight_icon.png',
        repeatable:false,
        passiveGeneration:null,
        completionCosts:{strength:1000, skill:1000, rules:1000, finesse:1000, armor:1000, horses:1000},
        completionGeneration:{honor:100},
        completionLearn:null,
        completionTools:null,
        completionYears:0.5,
        categories:null,
        unlock:{completedtasksand:["skill","finesse","horses"]},
        parenttask:{taskid:"finesse"},
        parentoffset:{x:0,y:60},
        name:"Knighthood!",
        hint:"All together now...",
        predescription:"A Squire must fully understand the three pillars of their training.",
        completionstory:"Well done, Ser Knight!",
        description:"By the almighty, you survived the training with your wits and back intact! Perhaps a Knight's life IS for you, afterall...",
    });

    verifyTasks();

    if (!player.age) {
        sendMessage("Welcome to the game! I won't bore you with details or story right now. Go ahead and start farming. (But, if you like story, check out the message log on the right side of the screen!)", true);
        resetPlayer();
    } else {
        refreshStats();
    }



    if (false) {
        registerTaskDefinition({
            storyline:"dev",
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
            unlock:{completedtasksand:["sellwheat","farm2"]},
            parenttasksor:["sellwheat","farm2"],
            hint:"This is THE DEV TASK",
            name:"Dev Test Task",
            predescription:"This shouldn't generally be in the live game, if it is let the devs know 'cause we left dev mode on.",
            completionstory:"You did a dev test!",
            description:"Just here so I can easily test new task-related features/improvements...",
        });
    }

    checkVisibleTasks();
}

function startGame() {
    resetGame();

    // the rest of this is UI hooks...
//    popup.addEventListener('click', closePopup, false);
    popup_x.addEventListener('click', closePopup, false);

    canvas.addEventListener('click', handleMouseClick, false);
    canvas.addEventListener('mousemove', handleMouseMove, false);
    canvas.addEventListener('mousedown', handleMouseDown, false);
    canvas.addEventListener('mouseup', handleMouseUp, false);
    canvas.addEventListener('mouseout', handleMouseOut, false);

    var scaleFactor = 1.1;
    var zoom = function(clicks){
//        var pt = ctx.transformedPoint(lastX,lastY);
//        ctx.translate(pt.x,pt.y);
//        var factor = Math.pow(scaleFactor,clicks);
//        ctx.scale(factor,factor);
//        ctx.translate(-pt.x,-pt.y);
//        draw();
    }

    var handleScroll = function(evt){
//        var delta = evt.wheelDelta ? evt.wheelDelta/40 : evt.detail ? -evt.detail : 0;
//        if (delta) zoom(delta);
//        return evt.preventDefault() && false;
    };
    canvas.addEventListener('DOMMouseScroll',handleScroll,false);
    canvas.addEventListener('mousewheel',handleScroll,false);
    window.requestAnimationFrame(loop)
}

var lastX = null, lastY = null;
var mouseIsDown = false, dragged = false;
var hoveredOverTask = null;

var handleMouseClick = function(e) {
    if (popupDiv.style.display!="none") { hideToolTip(); mouseIsDown = false; dragged = false; hoveredOverTask = null; lastX = null; lastY = null; return; }
    if (dragged) return; // i tried putting this handle click logic in "mouseup" but it missed a lot of stuff i considered a click for some reason?

    var clickedTask = findClosestTask(e)
    if (clickedTask && clickedTask.history.mode=='hintmode') return;
    if (clickedTask && clickedTask.history.mode=='locked') return;
    if (clickedTask && clickedTask.history.mode=='completed') return;

    doTask(clickedTask);
}

var handleMouseDown = function(evt) {
    if (popupDiv.style.display!="none") { hideToolTip(); mouseIsDown = false; dragged = false; hoveredOverTask = null; lastX = null; lastY = null; return; }
    document.body.style.mozUserSelect = document.body.style.webkitUserSelect = document.body.style.userSelect = 'none';
    lastX = event.clientX;
    lastY = event.clientY
    mouseIsDown = true;
    dragged = false;
}

function handleMouseMove(e) {
    if (popupDiv.style.display!="none") { hideToolTip(); mouseIsDown = false; dragged = false; hoveredOverTask = null; lastX = null; lastY = null; return; }
    var previousX = lastX;
    var previousY = lastY;
    lastX = event.clientX;
    lastY = event.clientY;

    if (!mouseIsDown) {
        hoveredOverTask = findClosestTask(e);

        if (hoveredOverTask) {
            showToolTip();
        } else { // No task, hide tooltip
            hideToolTip();
        }
    } else {
        // nobody likes jitter drags.
        if (Math.abs(lastX - previousX) + Math.abs(lastY - previousY) <= 3) return;

        hideToolTip(); // tooltips while dragging felt weird
        dragged = true;

        var rect = canvas.getBoundingClientRect();

        var dx = (lastX - previousX);
        var dy = (lastY - previousY);

        player.history.camtransx += dx;
        player.history.camtransy += dy;

        needRedraw = true;
    }
}

var handleMouseOut = function(e) {
    if (popupDiv.style.display!="none") { hideToolTip(); mouseIsDown = false; dragged = false; hoveredOverTask = null; lastX = null; lastY = null; return; }
    if (dragged) save();

    mouseIsDown = false;
    hoveredOverTask = null;
    hideToolTip();
}

var handleMouseUp = function(e) {
    if (popupDiv.style.display!="none") { hideToolTip(); mouseIsDown = false; dragged = false; hoveredOverTask = null; lastX = null; lastY = null; return; }
    if (dragged) save();

    mouseIsDown = false;

    hoveredOverTask = findClosestTask(e);

    if (hoveredOverTask) {
        showToolTip();
    }
}

function saveExport() {
    var txt = document.getElementById("savestring");

    txt.style.display="block";
    txt.value = btoa(JSON.stringify(player));

    txt.select();
    txt.setSelectionRange(0, 99999);

    document.execCommand("copy");

    txt.style.display="none";

    alert("Your save string has been copied to your clipboard.");
}

function saveImport() {
    var json = atob(prompt("Paste your save string in here."));

    try {
        obj = JSON.parse(json);
        console.log(obj);
        if (obj.age > 5) {
            // assume that's enough to try to load it.

            window.localStorage.setItem("player", btoa(json));
            resetGame();
            needRedraw = true;
         }
    } catch (e) {
        console.log(e);
        return;
    }
}