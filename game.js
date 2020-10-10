game = {alltasks:{},startage:18,maxage:30}
player = {tasks:{},resources:{},activetaskid:null,history:{camscale:2,camtransx:-500,camtransy:-300}}

canvas = document.getElementById("canvas");
ctx = canvas.getContext("2d");

//GAMESPEED_RATIO = 1 / (5 * 60 * 1000)  // 1 year every 5 minutes in ms
GAMESPEED_RATIO = 1 / (1 * 1000)  // 1 year every 1 seconds in ms

var generateResource = function(task, resourceName, rawAmount) {
    if (!player.resources[resourceName]) {
        player.resources[resourceName] = 0;
    }
    return rawAmount*Math.pow(1.1,task.history.maxlevel); // this should get complicated with groundhog meta?
}

var processPassiveTask = function(task, yearsElapsed) {
    for (resource in task.def.passiveGeneration) {
        if (!player.resources[resource]) {
            player.resources[resource] = 0;
        }
        player.resources[resource] += generateResource(task, resource, task.def.passiveGeneration[resource]*yearsElapsed);
    }
}

var nextMiscX = 300;
var nextMiscY = 100;
var checkVisibleTasks = function() {
    game.tasks = [];

    hoveredTaskStillVisible = false;

    Object.entries(game.alltasks).forEach(e => {
        var task = e[1];

        var completed = !task.def.repeatable && task.life.level > 0;

        if (completed) return;

        var freebie = task.def.unlock === null;
        var active = task.life.level > 0;
        var prereqMet = task.def.unlock !== null && game.alltasks[task.def.unlock.taskid].life.level >= task.def.unlock.level;
        var prereqPreviouslyMet = task.def.unlock !== null && task.def.unlock.permanent && task.history.seen;

        if (freebie || active || prereqMet || prereqPreviouslyMet) {
            game.tasks.push(task);
            if (task === hoveredOverTask) hoveredTaskStillVisible = true;
            if (!task.history.seen) {
                task.history.seen = true;
                task.history.x = task.def.unlock === null ? nextMiscX : game.alltasks[task.def.unlock.taskid].history.x + 100;
                task.history.y = task.def.unlock === null ? (nextMiscY += 100) : game.alltasks[task.def.unlock.taskid].history.y;
            }
        }
    });

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
            player.resources[resource] += generateResource(task, resource, task.def.completionGeneration[resource]);
        }
    }

    task.life.level++;
    // the important part of a completed task is checking if new tasks are unlocked
    // (one day this might happen outside of task completion/game init 'cause who tf knows what would cause unlocks? maybe?)
    checkVisibleTasks();
}

var doTask = function(task) {
    if (task === null) return;
    if (player.activetaskid !== null) return;
    if (!task.def.repeatable && task.level > 0) return;

    // if we can't do this task for some other reason, return? Not visible (cheaters!)? Not enough money? (need a UI indicator for that when i wrote this...)

    player.activetaskid = task.def.taskid;
    task.life.yearsWorked = 0;
}

function sendMessage(text) {
    messageBlock = document.getElementById("messages")
    messageBlock.innerHTML = "<br/>" + text + "<br/>" + messageBlock.innerHTML;
}

function killPlayer(description) {
    sendMessage(description);

    Object.entries(game.alltasks).forEach(e => {
        var task = e[1];

        if (task.def.repeatable) {
            task.history.maxlevel = Math.max(task.history.maxlevel||0, task.life.level||0);
        } else {
            task.history.maxlevel += (task.history.maxlevel||0) + task.life.level; // for repeatables, they get more "powerful" every time you do it.
        }
        task.life.level = 0;
    });

    player.age = game.startage;
    player.activetaskid = null;
    player.resources = {};
    checkVisibleTasks();

    refreshStats();
}

function refreshStats()
{
    var miscStatsInnerHTML = "";

    document.getElementById("age").innerHTML=Math.round(player.age * 10) / 10;
    if (game.maxage - player.age > 5) {
        document.getElementById("agelabel").style.color="lightgreen";
    } else {
        document.getElementById("agelabel").style.color="pink";
    }

    // how should we order these? Most recently gained? Manual list? Alphabetical? Most-owned?
    for (resource in player.resources) {
        miscStatsInnerHTML += resource + ": " + Math.round(player.resources[resource] * 10) / 10 + "</br>";
    }
    if (miscStatsInnerHTML == "") miscStatsInnerHTML = "A whole lotta nothin'!";
    document.getElementById("MiscStats").innerHTML = miscStatsInnerHTML;
}

var update = function(elapsed) {
    if (player.activetaskid) { // if no active task, we don't update the game! NOT IDLE!
        var playertask = game.alltasks[player.activetaskid];
        var maxYearsElapsed = elapsed * GAMESPEED_RATIO;
        var remainingYears = computeCompletionYears(playertask) - playertask.life.yearsWorked;
        var yearsElapsed = Math.min(maxYearsElapsed, remainingYears);

        // continue the active task...
        playertask.life.yearsWorked += yearsElapsed;

        if (computeCompletionYears(playertask) == playertask.life.yearsWorked) {
            completeTask(playertask);
            player.activetaskid = null;
        }

        // not in V1, but this is probably where automated tasks would go?
        // game.autotasks.forEach(task => { ...
        game.tasks.forEach(task => {
            // if this task is active (level > 0) and generates passive income, we do that here.
            if (task.life.level > 0) {
                if (task.def.passiveGeneration != null) {
                    processPassiveTask(task, yearsElapsed);
                }
            }
        });

        player.age += yearsElapsed;

        if (player.age > game.maxage) {
            killPlayer("Oh no! You died of old age! Blah blah blah story wtf you're " + game.startage + " again");
        }
    }
    refreshStats()
}

var canvasdiv = document.getElementById("canvasdiv");
var draw = function() {
    canvas.width = canvasdiv.offsetWidth;
    canvas.height = canvasdiv.offsetHeight;

//    ctx.save();

    ctx.fillStyle = "#222222";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.translate(player.history.camtransx, player.history.camtransy);
    ctx.scale(player.history.camscale, player.history.camscale);

    game.tasks.forEach(task => {
        var image = task.def.img;
        if (image == null) {
            task.def.img = new Image();
            task.def.img.onload = function() {
                ctx.drawImage(task.def.img, task.history.x-25, task.history.y-25, 50, 50);
                task.def.img.onload = null;
            }
            task.def.img.src = task.def.imageUrl;
            return;
        }

        ctx.drawImage(image, task.history.x-25, task.history.y-25, 50, 50);

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
        draw()
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
        if (d < closestClick) {
            closestClick = d;
            closestTask = task;
        }
    });
    return closestTask;
}

var tooltip = document.getElementById("tooltip");
function updateTooltipText() {
    if (!updateTooltipText) hideToolTip();
    tooltip.innerHTML = hoveredOverTask.def.name + "<br/>"
                   + hoveredOverTask.def.description + "<br/>"
                   + "Takes " + Math.round(computeCompletionYears(hoveredOverTask)*10)/10 + " years<br/>"
                   + (hoveredOverTask.def.passiveGeneration ? (hoveredOverTask.life.level > 0 ? "Currently passively producing " : "Upon completion would start to passively produce ") + "the following per year...<br/>" + Object.entries(hoveredOverTask.def.passiveGeneration).map(e => e[0] + ": " + (Math.round(generateResource(hoveredOverTask, e[0], e[1])*10)/10)) + "<br/>" : "")
                   + (hoveredOverTask.def.completionGeneration ? "Upon active completion, will produce...<br/>" + Object.entries(hoveredOverTask.def.completionGeneration).map(e => e[0] + ": " + (Math.round(generateResource(hoveredOverTask, e[0], e[1])*10)/10)) + "<br/>" : "")
                   + ((hoveredOverTask.life.level===0 && hoveredOverTask.history.maxlevel===0) ? "<br/>Is " + (hoveredOverTask.def.repeatable ? "" : "not ") + " repeatable after first completion.<br/>" : "");
   // things to maybe add:
   // "Will unlock..." ? (not sure i want this in the tooltip, honestly)
   // How much passive it would produce if you leveled it up. (also: passives should go up with life.level?)
   // Highest level you've ever had.
   // Current level.
}

function showToolTip() {
    updateTooltipText();
    tooltip.style.left = event.clientX + 20;
    tooltip.style.top = event.clientY;
    tooltip.style.display = "block";
}

function hideToolTip() {
    tooltip.style.display="none";
}

function computeCompletionYears(task) {
    return task.def.completionYears * Math.pow(0.99,task.history.maxlevel);
}

function registerTaskDefinition(taskDefinition) {
    var task = {def:taskDefinition,life:{level:0},history:{maxlevel:0}};
    game.alltasks[taskDefinition.taskid] = task;
    var playertask = {life:task.life, history:task.history};
    player.tasks[taskDefinition.taskid] = playertask;
}

function startGame() {
    var c = document.getElementById("canvas");
    var ctx = c.getContext("2d");

    registerTaskDefinition({
        taskid:1,
        imageUrl:'images/farm1.png',
        repeatable:true,
        passiveGeneration:{wheat:0.1},
        completionGeneration:{wheat:1},
        completionYears:1,
        unlock:null,
        name:"Farm",
        description:"Farm some resources",
    });

    var task2 = {};
    task2.taskid = 2;
    task2.imageUrl = 'images/stone.png';
    task2.repeatable = false;
    task2.completionGeneration = {stone:50};
    task2.completionYears = 5;
    task2.unlock = {taskid: 1, level:4, permanent:true};
    task2.name = "Remove Stones";
    task2.description = "These rocks are messin' with yer farmin'! Git!";

    var task3 = {};
    task3.taskid = 3;
    task3.imageUrl = 'images/farm2.png';
    task3.repeatable = true;
    task3.passiveGeneration = {wheat:0.5};
    task3.completionGeneration = {wheat:2};
    task3.completionYears = 0.75;
    task3.unlock = {taskid: 2, level:1, permanent:false};
    task3.name = "Better Farming";
    task3.description = "Like if you are better at farming";

    registerTaskDefinition(task2);
    registerTaskDefinition(task3);

    killPlayer("Welcome to the game! One day, we might save progress, but right now you get to start at the start every time. But that's probably okay, the game just ain't that long.");

    checkVisibleTasks();

    canvas.addEventListener('click', handleMouseClick, false);
    canvas.addEventListener('mousemove', handleMouseMove, false);

    window.requestAnimationFrame(loop)
}

var handleMouseClick = function(e) {
    var clickedTask = findClosestTask(e)
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
