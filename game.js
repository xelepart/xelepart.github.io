game = {alltasks:[],resources:{},activetask:null,camscale:1,camtransx:0,camtransy:0,age:18,maxage:50}

canvas = document.getElementById("canvas");
ctx = canvas.getContext("2d");

//GAMESPEED_RATIO = 1 / (5 * 60 * 1000)  // 1 year every 5 minutes in ms
GAMESPEED_RATIO = 1 / (1 * 1000)  // 1 year every 1 seconds in ms

var generateResource = function(task, resourceName, rawAmount) {
    if (!game.resources[resourceName]) {
        game.resources[resourceName] = 0;
    }
    game.resources[resourceName] += rawAmount; // this should get complicated with groundhog meta?
}

var processPassiveTask = function(task, yearsElapsed) {
    for (resource in task.passiveGeneration) {
        generateResource(task, resource, task.def.passiveGeneration[resource]*yearsElapsed);
    }
}

var nextMiscX = 300;
var nextMiscY = 100;
var checkVisibleTasks = function() {
    game.tasks = [];
    game.alltasks.forEach(task => {
        var completed = !task.def.repeatable && task.life.level > 0;

        if (completed) return;

        var freebie = task.def.unlock === null;
        var active = task.life.level > 0;
        var prereqMet = task.def.unlock !== null && task.def.unlock.def.realtask.life.level >= task.def.unlock.level;
        var prereqPreviouslyMet = task.def.unlock !== null && task.def.unlock.permanent && task.history.seen;

        if (freebie || active || prereqMet || prereqPreviouslyMet) {
            game.tasks.push(task);
            if (!task.history.seen) {
                task.history.seen = true;
                task.history.x = task.def.unlock === null ? nextMiscX : task.def.unlock.def.realtask.history.x + 100;
                task.history.y = task.def.unlock === null ? (nextMiscY += 100) : task.def.unlock.def.realtask.history.y;
            }
        }
    });
}

var completeTask = function(task) {
    if (task.def.completionGeneration != null) {
        for (resource in task.def.completionGeneration) {
            generateResource(task, resource, task.def.completionGeneration[resource]);
        }
    }

    task.life.level++;
    // the important part of a completed task is checking if new tasks are unlocked
    // (one day this might happen outside of task completion/game init 'cause who tf knows what would cause unlocks? maybe?)
    checkVisibleTasks();
}

var doTask = function(task) {
    if (task === null) return;
    if (game.activetask !== null) return;
    if (!task.def.repeatable && task.level > 0) return;

    // if we can't do this task for some other reason, return? Not visible (cheaters!)? Not enough money? (need a UI indicator for that when i wrote this...)

    game.activetask = task;
    task.life.yearsWorked = 0;
}

function sendMessage(text) {
    messageBlock = document.getElementById("messages")
    messageBlock.innerHTML = text + "<br/>" + messageBlock.innerHTML;
}

function killPlayer(description) {
    sendMessage(description);

    game.alltasks.forEach(task => {
        task.history.maxlevel = Math.max(task.history.maxlevel||0, task.life.level||0);
        task.life.level = 0;
    });
    game.activetask = null;
}

var update = function(elapsed) {
    if (game.activetask) { // if no active task, we don't update the game! NOT IDLE!
        var maxYearsElapsed = elapsed * GAMESPEED_RATIO;
        var remainingYears = game.activetask.def.completionYears - game.activetask.life.yearsWorked;
        var yearsElapsed = Math.min(maxYearsElapsed, remainingYears);
        document.getElementById("age").innerHTML=Math.round(game.age * 10) / 10;
        // continue the active task...
        game.activetask.life.yearsWorked += yearsElapsed;

        if (game.activetask.def.completionYears == game.activetask.life.yearsWorked) {
            completeTask(game.activetask);
            game.activetask = null;
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

        game.age += yearsElapsed;

        if (game.age > game.maxage) {
            killPlayer("Oh no! You died of old age! Blah blah blah story wtf you're 18 again");
        }
    }
}

var draw = function() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

//    ctx.save();

    ctx.fillStyle = "#222222";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.translate(game.camtransx, game.camtransy);
    ctx.scale(game.camscale, game.camscale);

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

        if (task = game.activetask) {
            var pctComplete = task.life.yearsWorked / task.def.completionYears;

            ctx.globalAlpha=0.3
            ctx.beginPath();
            ctx.moveTo(task.history.x, task.history.y);
            ctx.lineTo(task.history.x, task.history.y + 25);
            ctx.arc(task.history.x, task.history.y, 25, -0.5*Math.PI, 2 * Math.PI * pctComplete - 0.5*Math.PI, true);
            ctx.lineTo(task.history.x, task.history.y);
            ctx.fill();
            ctx.globalAlpha=1
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

    x = x - game.camtransx;
    y = y - game.camtransy;

    x = x / game.camscale;
    y = y / game.camscale;

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

function showToolTip(task) {
    var tooltip = document.getElementById("tooltip");
    tooltip.innerHTML = task.def.name + "<br/>" + task.def.description;
    tooltip.style.left = event.clientX + 20;
    tooltip.style.top = event.clientY - 20;
    tooltip.style.display = "block";
}

function hideToolTip() {
    tooltip.style.display="none";
}

function registerTaskDefinition(taskDefinition) {
    var task = {def:taskDefinition,life:{level:0},history:{maxlevel:0}};
    taskDefinition.realtask = task; // CIRCULAR WHEE (we should make these things like real classes i suspect)
    game.alltasks.push(task);
}

function startGame() {
    var c = document.getElementById("canvas");
    var ctx = c.getContext("2d");

    var task1 = {};
    task1.imageUrl = 'images/farm1.jpg';
    task1.repeatable = true;
    task1.completionGeneration = {wheat:1};
    task1.completionYears = 1;
    task1.unlock = null;
    task1.name = "Farm";
    task1.description = "Farm some resources";

    var task2 = {};
    task2.imageUrl = 'images/rock.png';
    task2.repeatable = false;
    task2.completionGeneration = {stone:50};
    task2.completionYears = 5;
    task2.unlock = {def: task1, level:4, permanent:true}
    task2.name = "Remove Rocks";
    task2.description = "These rocks are messin' with yer farmin'! Git!";

    var task3 = {};
    task3.imageUrl = 'images/farm2.jpg';
    task3.repeatable = true;
    task3.passiveGeneration = {wheat:0.5};
    task3.completionGeneration = {wheat:2};
    task3.completionYears = 0.75;
    task3.unlock = {def: task2, level:1, permanent:false}
    task3.name = "Better Farming";
    task3.description = "Like if you are better at farming";

    registerTaskDefinition(task1);
    registerTaskDefinition(task2);
    registerTaskDefinition(task3);

    killPlayer("Welcome to the game! Apologies about this annoying thing every time you start, we'll either get some save state or move the story out of alerts soon. Promise.");

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
        showToolTip(hoveredOverTask);
    } else { // No task, hide tooltip
        hideToolTip(hoveredOverTask);
    }
}
