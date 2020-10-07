
var drawTask = function(task) {
    var c = document.getElementById("canvas");
console.log("hello!")
    c.width = window.innerWidth;
    c.height = window.innerHeight;

    var ctx = c.getContext("2d");

    var image = task.img;
    if (image == null) {
        task.img = new Image();
        task.img.src = task.imageUrl;
        image = task.img;
        console.log(image);
    }
console.log("hello!")

    ctx.save();
//    ctx.moveTo(-50,-50);
//    ctx.beginPath();
//    ctx.arc(2*24, 2*24, 2*24, 0, Math.PI*2, true);
//    ctx.closePath();
//    ctx.clip();

    ctx.drawImage(image, 50, 50, 4*240+2, 4*240+2);

    ctx.beginPath();
//    ctx.arc(0, 0, 2, 0, Math.PI*2, true);
//    ctx.clip();
//    ctx.closePath();
    ctx.restore();
console.log("hello!")
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
