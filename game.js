game = {alltasks:{},startage:18,maxage:30}
player = {tasks:{},resources:{},activetaskid:null,history:{camscale:2,camtransx:-500,camtransy:-300}}

canvas = document.getElementById("canvas");
ctx = canvas.getContext("2d");

//GAMESPEED_RATIO = 1 / (5 * 60 * 1000)  // 1 year every 5 minutes in ms
GAMESPEED_RATIO = 1 / (1 * 1000)  // 1 year every 1 seconds in ms

var computeResourceGeneration = function(task, resourceName, rawAmount) {
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
        player.resources[resource] += computeResourceGeneration(task, resource, task.def.passiveGeneration[resource]*yearsElapsed);
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
        var prereqMet = task.def.unlock !== null && ((task.def.unlock.taskid && game.alltasks[task.def.unlock.taskid].life.level >= task.def.unlock.level) || (task.def.unlock.resourceName && player.resources[task.def.unlock.resourceName] >= task.def.unlock.amount));
        var prereqPreviouslyMet = task.def.unlock !== null && task.def.unlock.permanent && task.history.seen;

        if (freebie || active || prereqMet || prereqPreviouslyMet) {
            game.tasks.push(task);
            if (task === hoveredOverTask) hoveredTaskStillVisible = true;
            if (!task.history.seen) {
                task.history.seen = true;
                task.history.x = (task.def.unlock === null || !task.def.unlock.taskid) ? nextMiscX : game.alltasks[task.def.unlock.taskid].history.x + 100;
                task.history.y = (task.def.unlock === null || !task.def.unlock.taskid) ? (nextMiscY += 100) : game.alltasks[task.def.unlock.taskid].history.y;
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
            player.resources[resource] += computeResourceGeneration(task, resource, task.def.completionGeneration[resource]);
        }
    }

    task.life.level++;

    if (!task.history.evercompleted) {
        sendMessage(task.def.completionstory, true);
    }

    task.history.evercompleted = true;
    // the important part of a completed task is checking if new tasks are unlocked
    // (one day this might happen outside of task completion/game init 'cause who tf knows what would cause unlocks? maybe?)
    checkVisibleTasks();
}

var doTask = function(task) {
    if (task === null) return;
    if (player.activetaskid !== null) return;
    if (!task.def.repeatable && task.level > 0) return;

    computeCompletionCost
    if (task.def.completionCosts) {
        var missingResources = false;
        Object.entries(task.def.completionCosts).forEach((e)=> {
            resource = e[0];
            amount = e[1];
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
                amount = e[1];
                player.resources[resource] -= amount;
            });
        }
    }
    // if we can't do this task for some other reason, return? Not visible (cheaters!)? Not enough money? (need a UI indicator for that when i wrote this...)

    player.activetaskid = task.def.taskid;
    task.life.yearsWorked = 0;
}

function sendMessage(text, popup) {
//    if (popup) alert(text + "    (sorry popup is alert, working on it)")
    messageBlock = document.getElementById("messages")
    messageBlock.innerHTML = "<br/>" + text + "<br/>" + messageBlock.innerHTML;
}

function resetPlayer() {
    player.age = game.startage;
    player.activetaskid = null;
    player.resources = {};
    checkVisibleTasks();

    refreshStats();
}

function killPlayer(description) {
    sendMessage(description, true);

    Object.entries(game.alltasks).forEach(e => {
        var task = e[1];

        if (task.def.repeatable) {
            task.history.maxlevel = Math.max(task.history.maxlevel||0, task.life.level||0);
        } else {
            task.history.maxlevel += (task.history.maxlevel||0) + task.life.level; // for repeatables, they get more "powerful" every time you do it.
        }
        task.life.level = 0;
    });

    resetPlayer();
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
                   + (hoveredOverTask.history.evercompleted ? hoveredOverTask.def.description : hoveredOverTask.def.predescription) + "<br/>"
                   + "Takes " + Math.round(computeCompletionYears(hoveredOverTask)*10)/10 + " years<br/>"
                   + (hoveredOverTask.def.completionCosts ? "Doing this would cost...<br/>" + Object.entries(hoveredOverTask.def.completionCosts).map(e => e[0] + ": " + (Math.round(computeCompletionCost(hoveredOverTask, e[1])*10)/10)) + "<br/>" : "")
                   + (hoveredOverTask.def.passiveGeneration ? (hoveredOverTask.life.level > 0 ? "Currently passively producing " : "Upon completion would start to passively produce ") + "the following per year...<br/>" + Object.entries(hoveredOverTask.def.passiveGeneration).map(e => e[0] + ": " + (Math.round(computeResourceGeneration(hoveredOverTask, e[0], e[1])*10)/10)) + "<br/>" : "")
                   + (hoveredOverTask.def.completionGeneration ? "Upon active completion, will produce...<br/>" + Object.entries(hoveredOverTask.def.completionGeneration).map(e => e[0] + ": " + (Math.round(computeResourceGeneration(hoveredOverTask, e[0], e[1])*10)/10)) + "<br/>" : "")
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
    tooltip.style.display="none";
}

function computeCompletionYears(task) {
    return task.def.completionYears * Math.pow(0.99,task.history.maxlevel);
}

function computeCompletionCost(task, amount) {
    return amount * Math.pow(0.97,task.history.maxlevel);
}

function registerTaskDefinition(taskDefinition) {
    if (game.alltasks[taskDefinition.taskid]) {
        alert("Game definition invalid: taskid " + taskDefinition.taskid + " was defined twice. (Please contact the devs and report this!)");
        return;
    }

    var task = {def:taskDefinition,life:{level:0},history:{maxlevel:0}};
    game.alltasks[taskDefinition.taskid] = task;
    var playertask = {life:task.life, history:task.history};
    player.tasks[taskDefinition.taskid] = playertask;
}

function verifyTasks() {
    Object.entries(game.alltasks).forEach(e => {
        var task = e[1];
        if (task.def.unlock && task.def.unlock.taskid && !game.alltasks[task.def.unlock.taskid]) alert("Game definition invalid: Task " + task.taskid + " refers to non-existent task " + task.def.unlock.taskid + " for an unlock prerequisite. (Please contact the devs and report this!)");
        // other things to check: Task's unlock resoures are generated somewhere? (not trying to solve the graph, just sanity check for typos?)
        return;
    });
}

function startGame() {
    var c = document.getElementById("canvas");
    var ctx = c.getContext("2d");

    registerTaskDefinition({
        taskid:"farm1",
        imageUrl:'images/farm1.png',
        repeatable:true,
        completionCosts:null,
        passiveGeneration:null,
        completionGeneration:{wheat:1},
        completionYears:1,
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
        completionYears:5,
        unlock:{taskid: "farm1", level:4, permanent:true},
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
        completionYears:0.75,
        unlock:{taskid:"removestone", level:1, permanent:false},
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
        completionYears:0.5,
        unlock:{resourceName:"wheat", amount:10, permanent:true},
        name:"Sell Wheat",
        predescription:"Okay, you're starting to build up some wheat. There's probably a merchant in the city willing to take a cartload off your hands.",
        completionstory:"It was a long, dusty road to the city, but you found a merchant looking for wheat! What luck!",
        description:"Sell that wheat!",
    });

    verifyTasks();

    killPlayer("Welcome to the game! One day, we might save progress, but right now you get to start at the start every time. But that's probably okay, the game just ain't that long.");

    if (false) {
        player.resources.test=100;
        registerTaskDefinition({
            taskid:"dev",
            imageUrl:'images/dev.png',
            repeatable:true,
            completionCosts:{test:50},
            passiveGeneration:null,
            completionGeneration:{wheat:1},
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
