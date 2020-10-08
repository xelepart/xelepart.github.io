game = {tasks:[]}

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
        if (task.progress < 1) {
            ctx.globalAlpha=0.1
            ctx.beginPath();
            ctx.moveTo(task.x, task.y);
            ctx.lineTo(task.x, task.y + 25);
            ctx.arc(task.x, task.y, 25, -0.5*Math.PI, 2 * Math.PI * (task.progress) - 0.5*Math.PI, true);
            ctx.lineTo(task.x, task.y);
            ctx.fill();
            ctx.globalAlpha=1
            task.progress = Math.min(1,task.progress+0.003);
        }
    })

    ctx.restore();
    setTimeout(draw, 30);
}

// original example code

//var c = document.getElementById("c");
//
//c.width = window.innerWidth;
//c.height = window.innerHeight;
//
//var ctx = c.getContext("2d");
//ctx.moveTo(0, 0);
//ctx.lineTo(2000, 1000);
//ctx.stroke();
//
//ctx.beginPath();
//ctx.arc(95, 50, 40, 0, 2 * Math.PI);
//ctx.stroke();
//
//ctx.font = "30px Arial";
//ctx.fillText("Ugh, World", 100, 50);

// if chrome is making weird borders, the internet suggested this (either every time or once as a caching prep?)
var prepTaskCanvas = function(img) {
    var tmpCanvas = document.createElement('canvas'),
        tmpCtx = tmpCanvas.getContext('2d'),
        image = new Image();

    image.src = img;
    console.log(image);

    tmpCanvas.width = image.width*2;
    tmpCanvas.height = image.height*2;

    // draw the cached images to temporary canvas and return the context
    tmpCtx.save();
    tmpCtx.beginPath();
    tmpCtx.arc(2*24, 2*24, 2*24, 0, Math.PI*2, true);
    tmpCtx.closePath();
    tmpCtx.clip();

    tmpCtx.drawImage(image, 0, 0, 4*24+2, 4*24+2);

    tmpCtx.beginPath();
    tmpCtx.arc(0, 0, 2, 0, Math.PI*2, true);
    tmpCtx.clip();
    tmpCtx.closePath();
    tmpCtx.restore();

    return tmpCanvas;
};

function startGame() {
    var c = document.getElementById("canvas");
    var ctx = c.getContext("2d");

    var task1 = {};
    task1.imageUrl = 'images/farm1.jpg';
    task1.x = 50;
    task1.y = 200;
    task1.progress = 0.75;

    var task2 = {};
    task2.imageUrl = 'images/rock.png';
    task2.x = 100;
    task2.y = 200;
    task2.progress = 1;

    var task3 = {};
    task3.imageUrl = 'images/farm2.jpg';
    task3.x = 200;
    task3.y = 50;
    task3.progress = 0.25;

    game.tasks = [task1, task2, task3];
    draw();

}