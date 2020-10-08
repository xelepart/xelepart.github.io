
var drawTask = function(task) {
    var c = document.getElementById("canvas");
    c.width = window.innerWidth;
    c.height = window.innerHeight;

    var ctx = c.getContext("2d");

    var image = task.img;
    if (image == null) {
        task.img = new Image();
        task.img.onload = function() {
            drawTask(task);
            task.img.onload = null;
        }
        task.img.src = task.imageUrl;
        return;
    }

    ctx.save();

    ctx.beginPath();
    ctx.arc(task.x, task.y, 26, 0, Math.PI*2, true);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(image, task.x-13, task.y-13, 26, 26);

    ctx.restore();
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

    /* I think this shouldn't affect you */
    function showProgressBar(ctx) {
        var cur = 0
        var max=100;
        advanceProgressBar = function() {
            if (cur < max) {
                ctx.moveTo(10, cur);
                ctx.lineTo(10, cur + 10);
                ctx.stroke();
                cur += 10;
                setTimeout(advanceProgressBar, 500);
            }

        }
        advanceProgressBar();
    }
    showProgressBar(ctx);
    // Someone should rename this variable
    var lol_task = {};
    lol_task.imageUrl = 'images/farmer1.svg';
    lol_task.x = 50;
    lol_task.y = 200;
    lol_task.progress = 0.75;
    drawTask(lol_task)


}