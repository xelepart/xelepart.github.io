game = {resources:{},activetask:null}

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
        generateResource(task, resource, task.passiveGeneration[resource]*yearsElapsed);
    }
}

var checkVisibleTasks = function() {
    game.tasks = [];
    game.alltasks.forEach(task => {
        if (task.unlock === null || task.level > 0 || task.unlock !== null && task.unlock.task.level >= task.unlock.level) {
            game.tasks.push(task);
        }
    });
}

var completeTask = function(task) {
    if (task.completionGeneration != null) {
        for (resource in task.completionGeneration) {
            generateResource(task, resource, task.completionGeneration[resource]);
        }
    }

    task.level++;
    // the important part of a completed task is checking if new tasks are unlocked
    // (one day this might happen outside of task completion/game init 'cause who tf knows what would cause unlocks? maybe?)
    checkVisibleTasks();
}

var doTask = function(task) {
    if (task === null) return;
    if (game.activetask !== null) return;

    // if we can't do this task for some other reason, return? Not visible (cheaters!)? Not enough money? (need a UI indicator for that when i wrote this...)

    game.activetask = task;
    task.yearsWorked = 0;
}

var update = function(elapsed) {
    if (game.activetask) { // if no active task, we don't update the game! NOT IDLE!
        var maxYearsElapsed = elapsed * GAMESPEED_RATIO;
        var remainingYears = game.activetask.completionYears - game.activetask.yearsWorked;
        var yearsElapsed = Math.min(maxYearsElapsed, remainingYears);

        // continue the active task...
        game.activetask.yearsWorked += yearsElapsed;

        if (game.activetask.completionYears == game.activetask.yearsWorked) {
            completeTask(game.activetask);
            game.activetask = null;
        }

        // not in V1, but this is probably where automated tasks would go?
        // game.autotasks.forEach(task => { ...
        game.tasks.forEach(task => {
            // if this task is active (level > 0) and generates passive income, we do that here.
            if (task.level > 0) {
                if (task.passiveGeneration != null) {
                    processPassiveTask(task, yearsElapsed);
                }
            }
        });
    }
}

var draw = function() {
    var canvas = document.getElementById("canvas");
    var ctx = canvas.getContext("2d");
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    ctx.save();

    game.tasks.forEach(task => {
        var image = task.img;
        if (image == null) {
            task.img = new Image();
            task.img.onload = function() {
                ctx.drawImage(task.img, task.x-25, task.y-25, 50, 50);
                task.img.onload = null;
            }
            task.img.src = task.imageUrl;
            return;
        }

        ctx.drawImage(image, task.x-25, task.y-25, 50, 50);
        // gotta put a progress bar into the image now?
        if (task = game.activetask) { // not sure how to indicate it needs a cooldown for non-activetasks (not in V1 anyway)
            var pctComplete = task.yearsWorked / task.completionYears;

            ctx.globalAlpha=0.3
            ctx.beginPath();
            ctx.moveTo(task.x, task.y);
            ctx.lineTo(task.x, task.y + 25);
            ctx.arc(task.x, task.y, 25, -0.5*Math.PI, 2 * Math.PI * pctComplete - 0.5*Math.PI, true);
            ctx.lineTo(task.x, task.y);
            ctx.fill();
            ctx.globalAlpha=1
        }
    })

    ctx.restore();
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

function getMousePos(canvas, event) {
    var rect = canvas.getBoundingClientRect();
    return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
    };
}

function startGame() {
    var c = document.getElementById("canvas");
    var ctx = c.getContext("2d");

    var task1 = {};
    task1.imageUrl = 'images/farm1.jpg';
    task1.x = 250;
    task1.y = 250;
    task1.level = 0;
    task1.repeatable = true;
    task1.completionGeneration = {wheat:1};
    task1.completionYears = 1;
    task1.unlock = null;

    var task2 = {};
    task2.imageUrl = 'images/rock.png';
    task2.x = 250;
    task2.y = 300;
    task2.level = 0;
    task2.repeatable = false;
    task2.passiveGeneration = {stone:1};
    task2.completionGeneration = {stone:50};
    task2.completionYears = 1.5;
    task2.unlock = {task: task1, level:4, permanent:true}

    var task3 = {};
    task3.imageUrl = 'images/farm2.jpg';
    task3.x = 250;
    task3.y = 350;
    task3.level = 0;
    task3.repeatable = true;
    task3.passiveGeneration = {pmoney:2.5, omoney: 0.3};
    task3.completionGeneration = {wheat:2};
    task3.completionYears = 0.75;
    task3.unlock = {task: task2, level:1, permanent:false}

    game.alltasks = [task1, task2, task3];

    checkVisibleTasks();

    canvas.addEventListener('click', function(evt) {
        var mousePos = getMousePos(canvas, evt);
        var clickedTask = null;
        var closestClick = 25.1;
        game.tasks.forEach(task => {
            xd = task.x - mousePos.x;
            yd = task.y - mousePos.y;
            d = Math.sqrt(xd*xd+yd*yd)
            if (d < closestClick) {
                closestClick = d;
                clickedTask = task;
            }
        });

        doTask(clickedTask);

    }, false);

    window.requestAnimationFrame(loop)
}