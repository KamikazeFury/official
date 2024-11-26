class MainScene extends Phaser.Scene {
    constructor() {
        super({ key: 'MainScene' });
    }

    preload() {
        // Load game assets with maxSize to ensure proper loading
        this.load.svg('player', 'assets/player.svg', { width: 64, height: 64 });
        this.load.svg('enemy', 'assets/enemy.svg');
        this.load.svg('spider', 'assets/spider.svg');
        this.load.svg('boss', 'assets/boss.svg');
    }

    create() {
        this.initializeGameState();
        this.createUI();
        this.showStartScreen();

        // Setup external controls
        const pauseButton = document.getElementById('pauseButton');
        const restartButton = document.getElementById('restartButton');

        pauseButton.addEventListener('click', () => {
            if (this.isPlaying) {
                this.togglePause();
            }
        });

        restartButton.addEventListener('click', () => {
            this.restartGame();
        });

        // Hide external buttons initially
        pauseButton.style.display = 'none';
        restartButton.style.display = 'none';

        // Add spacebar control for starting the game
        this.input.keyboard.on('keydown-SPACE', () => {
            if (!this.isPlaying && !this.gameOver) {
                this.startGame();
            }
        });
    }

    initializeGameState() {
        this.gameOver = false;
        this.currentLevel = 1;
        this.score = 0;
        this.isPaused = false;
        this.isPlaying = false;
        this.spiderSpawnTime = 0;
        this.bossActive = false;
        this.bossHealth = 0;
        this.bossMaxHealth = 0;
        
        // Player movement constraints
        this.playerBounds = {
            minX: 30,
            maxX: 770,
            minY: 100,
            maxY: 500
        };
        
        // Create groups
        if (this.enemies) this.enemies.clear(true, true);
        if (this.projectiles) this.projectiles.clear(true, true);
        if (this.spiders) this.spiders.clear(true, true);
        
        this.enemies = this.add.group();
        this.projectiles = this.add.group();
        this.spiders = this.add.group();

        // Clear any existing timers
        if (this.enemyMoveTimer) {
            this.enemyMoveTimer.destroy();
        }
        if (this.spiderTimer) {
            this.spiderTimer.destroy();
        }
        if (this.bossTimer) {
            this.bossTimer.destroy();
        }
    }

    createUI() {
        // Clear existing UI if any
        if (this.uiContainer) {
            this.uiContainer.destroy();
        }

        // Create UI container
        this.uiContainer = this.add.container(0, 0);

        // Create score and level text with better visibility
        this.scoreText = this.add.text(16, 16, 'Score: 0', {
            fontSize: '28px',
            fill: '#00ffff',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 4
        });

        this.levelText = this.add.text(16, 50, 'Level: 1', {
            fontSize: '28px',
            fill: '#00ffff',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 4
        });
        
        // Set depth to ensure visibility
        this.scoreText.setDepth(100);
        this.levelText.setDepth(100);
        
        // Add to UI container
        this.uiContainer.add([this.scoreText, this.levelText]);
        this.uiContainer.setDepth(100);
    }

    startGame() {
        if (this.isPlaying) return;
        
        this.isPlaying = true;

        // Show external buttons
        document.getElementById('pauseButton').style.display = 'block';
        document.getElementById('restartButton').style.display = 'block';

        // Fade out start screen elements
        this.tweens.add({
            targets: [this.titleText, this.highScoreText, this.pressSpaceText],
            alpha: 0,
            duration: 1000,
            onComplete: () => {
                this.titleText.destroy();
                this.highScoreText.destroy();
                this.pressSpaceText.destroy();
            }
        });

        // Create player
        this.player = this.add.sprite(400, 400, 'player');
        this.player.setScale(1); // Reset to default scale first
        this.player.setDepth(1);
        
        // Initial rotation to point upward
        this.player.rotation = -Math.PI / 2;

        // Setup keyboard controls
        this.cursors = this.input.keyboard.createCursorKeys();

        // Setup mouse controls
        this.input.on('pointermove', (pointer) => {
            if (this.player && !this.gameOver && !this.isPaused) {
                this.updatePlayerRotation(pointer);
            }
        });

        this.input.on('pointerdown', (pointer) => {
            if (pointer.button === 0 && !this.gameOver && !this.isPaused) { // Left click
                this.shoot();
            }
        });

        // Create initial enemies
        this.createEnemies();

        // Start spider spawning
        this.spiderTimer = this.time.addEvent({
            delay: 5000,
            callback: this.spawnSpider,
            callbackScope: this,
            loop: true
        });
    }

    updatePlayerRotation(pointer) {
        if (!this.player) return;

        // Calculate angle between player and mouse pointer
        const dx = pointer.x - this.player.x;
        const dy = pointer.y - this.player.y;
        const angle = Math.atan2(dy, dx);
        
        // Set rotation with offset
        this.player.rotation = angle + Math.PI / 2;
    }

    update() {
        if (!this.isPlaying || this.gameOver || this.isPaused) return;

        // Update player movement
        this.updatePlayerMovement();

        // Update projectiles
        this.projectiles.getChildren().forEach(projectile => {
            projectile.x += projectile.velocityX;
            projectile.y += projectile.velocityY;

            // Remove if off screen
            if (projectile.x < -50 || projectile.x > 850 || 
                projectile.y < -50 || projectile.y > 650) {
                projectile.destroy();
            }
        });

        // Move spiders
        this.moveSpiders();

        // Check for collisions
        this.checkCollisions();
    }

    updatePlayerMovement() {
        const moveSpeed = 5;
        
        // Horizontal movement
        if (this.cursors.left.isDown && this.player.x > this.playerBounds.minX) {
            this.player.x -= moveSpeed;
        }
        if (this.cursors.right.isDown && this.player.x < this.playerBounds.maxX) {
            this.player.x += moveSpeed;
        }

        // Vertical movement
        if (this.cursors.up.isDown && this.player.y > this.playerBounds.minY) {
            this.player.y -= moveSpeed;
        }
        if (this.cursors.down.isDown && this.player.y < this.playerBounds.maxY) {
            this.player.y += moveSpeed;
        }
    }

    spawnSpider() {
        if (this.gameOver || !this.isPlaying || this.isPaused) return;

        // Increase max spiders with level
        const maxSpiders = 2 + Math.floor(this.currentLevel / 3);
        if (this.spiders.getChildren().length >= maxSpiders) return;

        // Random side (left or right)
        const side = Math.random() < 0.5 ? 'left' : 'right';
        const x = side === 'left' ? -20 : 820;
        const y = Phaser.Math.Between(100, 400);

        const spider = this.add.sprite(x, y, 'spider');
        spider.setScale(1.2);
        this.spiders.add(spider);

        // Set spider properties
        spider.speed = 4 + (this.currentLevel * 0.5); // Faster with level
        spider.points = 100 + (this.currentLevel * 20);
        spider.moveTime = 0;
        spider.direction = { x: 0, y: 0 };
        spider.setDepth(1);
        this.updateSpiderDirection(spider);

        // Add spider shooting
        if (this.currentLevel > 2) { // Spiders start shooting after level 2
            spider.shootTimer = 0;
            spider.shootDelay = Math.max(120 - (this.currentLevel * 10), 30); // Faster shooting with level
        }
    }

    updateSpiderDirection(spider) {
        // Calculate direction towards player with more randomness at higher levels
        const dx = this.player.x - spider.x;
        const dy = this.player.y - spider.y;
        const angle = Math.atan2(dy, dx);
        
        // More erratic movement at higher levels
        const randomFactor = 0.5 + (this.currentLevel * 0.1);
        const randomAngle = angle + (Math.random() - 0.5) * randomFactor;
        
        spider.direction = {
            x: Math.cos(randomAngle),
            y: Math.sin(randomAngle)
        };
    }

    moveSpiders() {
        this.spiders.getChildren().forEach(spider => {
            // Update direction occasionally
            spider.moveTime++;
            if (spider.moveTime > Math.max(30 - this.currentLevel, 10)) {
                this.updateSpiderDirection(spider);
                spider.moveTime = 0;
            }

            // Move spider
            spider.x += spider.direction.x * spider.speed;
            spider.y += spider.direction.y * spider.speed;

            // Spider shooting
            if (spider.shootTimer !== undefined) {
                spider.shootTimer++;
                if (spider.shootTimer >= spider.shootDelay) {
                    spider.shootTimer = 0;
                    this.spiderShooting(spider);
                }
            }

            // Remove if off screen
            if (spider.x < -50 || spider.x > 850 || spider.y < -50 || spider.y > 650) {
                spider.destroy();
            }
        });
    }

    spiderShooting(spider) {
        const angle = Math.atan2(this.player.y - spider.y, this.player.x - spider.x);
        const projectile = this.add.rectangle(
            spider.x,
            spider.y,
            6,
            6,
            0xff00ff
        );
        projectile.isEnemyProjectile = true;
        projectile.velocityX = Math.cos(angle) * 6;
        projectile.velocityY = Math.sin(angle) * 6;
        this.projectiles.add(projectile);
    }

    createEnemies() {
        // Clear any existing enemies
        this.enemies.clear(true, true);

        // Calculate number of enemies based on level
        const numEnemies = 8 + Math.floor(this.currentLevel * 1.5);
        const enemySpacing = 40;
        let lastEnemy = null;

        for (let i = 0; i < numEnemies; i++) {
            const enemy = this.add.sprite(
                50 + (i % 4) * enemySpacing,
                50 + Math.floor(i / 4) * enemySpacing,
                'enemy'
            );
            enemy.setScale(1.2);
            this.enemies.add(enemy);

            // Set movement properties
            enemy.moveDirection = 1; // 1 for right, -1 for left
            enemy.verticalDirection = 1; // 1 for down, -1 for up
            enemy.moveSpeed = 3 + (this.currentLevel * 0.4); // Faster with each level
            enemy.points = 10 + (this.currentLevel * 5);
            enemy.setDepth(1);
            
            // Link to previous enemy
            enemy.previousEnemy = lastEnemy;
            lastEnemy = enemy;
        }

        // Start enemy movement
        this.enemyMoveTimer = this.time.addEvent({
            delay: Math.max(16 - this.currentLevel, 8), // Faster update rate with level
            callback: this.moveEnemies,
            callbackScope: this,
            loop: true
        });
    }

    moveEnemies() {
        if (this.gameOver || !this.isPlaying || this.isPaused) return;

        const enemies = this.enemies.getChildren();
        enemies.forEach((enemy, index) => {
            // Move horizontally
            enemy.x += enemy.moveSpeed * enemy.moveDirection;

            // Check for screen bounds
            if (enemy.x > 780 || enemy.x < 20) {
                enemy.moveDirection *= -1;
                enemy.y += 20 * enemy.verticalDirection;

                // Check if reached bottom or top
                if (enemy.y > 500 || enemy.y < 50) {
                    enemy.verticalDirection *= -1;
                }
            }

            // Follow previous segment with delay
            if (index > 0) {
                const prevEnemy = enemies[index - 1];
                const dx = prevEnemy.x - enemy.x;
                const dy = prevEnemy.y - enemy.y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance > 40) {
                    enemy.x += (dx / distance) * enemy.moveSpeed;
                    enemy.y += (dy / distance) * enemy.moveSpeed;
                }
            }
        });
    }

    createBoss() {
        if (this.boss) {
            this.boss.destroy();
        }

        this.bossActive = true;
        this.bossMaxHealth = 8 + Math.floor(this.currentLevel * 0.8); // More health
        this.bossHealth = this.bossMaxHealth;

        // Create boss sprite
        this.boss = this.add.sprite(400, 100, 'boss');
        this.boss.setScale(1.5);
        this.boss.setDepth(2);

        // Add health bar
        this.bossHealthBar = this.add.rectangle(400, 50, 200, 20, 0xff0000);
        this.bossHealthBar.setDepth(2);

        // Boss movement properties
        this.boss.moveDirection = 1;
        this.boss.moveSpeed = 4 + (this.currentLevel * 0.3); // Faster with level
        this.boss.moveTimer = 0;
        this.boss.shootTimer = 0;
        this.boss.attackPattern = 0;
        this.boss.patternTimer = 0;

        // Start boss movement
        this.bossTimer = this.time.addEvent({
            delay: 16,
            callback: this.updateBoss,
            callbackScope: this,
            loop: true
        });
    }

    updateBoss() {
        if (!this.boss || !this.bossActive) return;

        // Update boss movement pattern
        this.boss.patternTimer++;
        if (this.boss.patternTimer > 300) { // Change pattern every 5 seconds
            this.boss.patternTimer = 0;
            this.boss.attackPattern = (this.boss.attackPattern + 1) % 3;
        }

        // Different movement patterns
        switch(this.boss.attackPattern) {
            case 0: // Side to side
                this.boss.moveTimer++;
                if (this.boss.moveTimer > 120) {
                    this.boss.moveDirection *= -1;
                    this.boss.moveTimer = 0;
                }
                this.boss.x += this.boss.moveSpeed * this.boss.moveDirection;
                break;
            case 1: // Circle pattern
                const centerX = 400;
                const centerY = 150;
                const radius = 100;
                const angle = (this.boss.patternTimer * this.boss.moveSpeed / 100);
                this.boss.x = centerX + Math.cos(angle) * radius;
                this.boss.y = centerY + Math.sin(angle) * radius;
                break;
            case 2: // Chase player
                const dx = this.player.x - this.boss.x;
                const dy = this.player.y - this.boss.y;
                const angle2 = Math.atan2(dy, dx);
                this.boss.x += Math.cos(angle2) * (this.boss.moveSpeed * 0.5);
                this.boss.y = Math.min(Math.max(100, 
                    this.boss.y + Math.sin(angle2) * (this.boss.moveSpeed * 0.5)), 200);
                break;
        }

        // Keep boss in bounds
        this.boss.x = Math.min(Math.max(100, this.boss.x), 700);

        // Update health bar
        if (this.bossHealthBar) {
            this.bossHealthBar.x = this.boss.x;
            this.bossHealthBar.width = (this.bossHealth / this.bossMaxHealth) * 200;
        }

        // Boss shooting
        this.boss.shootTimer++;
        if (this.boss.shootTimer > Math.max(60 - (this.currentLevel * 5), 20)) {
            this.boss.shootTimer = 0;
            this.bossShooting();
        }
    }

    bossShooting() {
        if (!this.boss || !this.bossActive) return;

        // Different attack patterns
        switch(this.boss.attackPattern) {
            case 0: // Spread shot
                this.bossSpreadShot();
                break;
            case 1: // Circle shot
                this.bossCircleShot();
                break;
            case 2: // Targeted burst
                this.bossTargetedBurst();
                break;
        }
    }

    bossSpreadShot() {
        const numProjectiles = 5 + Math.floor(this.currentLevel / 2);
        const spreadAngle = Math.PI / 4;
        const baseAngle = Math.atan2(this.player.y - this.boss.y, this.player.x - this.boss.x);

        for (let i = 0; i < numProjectiles; i++) {
            const angle = baseAngle + spreadAngle * (i - (numProjectiles - 1) / 2);
            this.createBossProjectile(angle);
        }
    }

    bossCircleShot() {
        const numProjectiles = 8 + Math.floor(this.currentLevel / 2);
        for (let i = 0; i < numProjectiles; i++) {
            const angle = (i / numProjectiles) * Math.PI * 2;
            this.createBossProjectile(angle);
        }
    }

    bossTargetedBurst() {
        const angle = Math.atan2(this.player.y - this.boss.y, this.player.x - this.boss.x);
        for (let i = 0; i < 3; i++) {
            setTimeout(() => {
                if (this.boss && this.bossActive) {
                    this.createBossProjectile(angle);
                }
            }, i * 100);
        }
    }

    createBossProjectile(angle) {
        const projectile = this.add.rectangle(
            this.boss.x,
            this.boss.y,
            8,
            8,
            0xff0000
        );
        projectile.isBossProjectile = true;
        projectile.velocityX = Math.cos(angle) * (6 + this.currentLevel * 0.3);
        projectile.velocityY = Math.sin(angle) * (6 + this.currentLevel * 0.3);
        this.projectiles.add(projectile);
    }

    checkCollisions() {
        if (this.gameOver || !this.isPlaying || this.isPaused) return;

        // Check projectiles
        this.projectiles.getChildren().forEach(projectile => {
            if (projectile.isBossProjectile || projectile.isEnemyProjectile) {
                // Check enemy projectiles hitting player
                if (this.player && Phaser.Geom.Intersects.RectangleToRectangle(
                    projectile.getBounds(), this.player.getBounds())) {
                    projectile.destroy();
                    this.handleGameOver();
                }
                return;
            }

            // Check boss hits
            if (this.bossActive && this.boss && Phaser.Geom.Intersects.RectangleToRectangle(
                projectile.getBounds(), this.boss.getBounds())) {
                projectile.destroy();
                this.bossHealth--;
                
                // Flash boss when hit
                this.tweens.add({
                    targets: this.boss,
                    alpha: 0.5,
                    duration: 100,
                    yoyo: true
                });

                if (this.bossHealth <= 0) {
                    this.updateScore(1000 * this.currentLevel);
                    this.defeatedBoss();
                }
                return;
            }

            // Check centipede segments
            this.enemies.getChildren().forEach(enemy => {
                if (Phaser.Geom.Intersects.RectangleToRectangle(projectile.getBounds(), enemy.getBounds())) {
                    projectile.destroy();
                    enemy.destroy();
                    
                    this.updateScore(enemy.points);

                    if (this.enemies.getChildren().length === 0 && !this.bossActive) {
                        this.startBossBattle();
                    }
                }
            });

            // Check spiders
            this.spiders.getChildren().forEach(spider => {
                if (Phaser.Geom.Intersects.RectangleToRectangle(projectile.getBounds(), spider.getBounds())) {
                    projectile.destroy();
                    spider.destroy();
                    
                    this.updateScore(spider.points);
                }
            });
        });

        // Check enemies and spiders hitting player
        const checkEnemyCollision = (enemy) => {
            if (this.player && Phaser.Geom.Intersects.RectangleToRectangle(
                this.player.getBounds(), enemy.getBounds())) {
                this.handleGameOver();
            }
        };

        this.enemies.getChildren().forEach(checkEnemyCollision);
        this.spiders.getChildren().forEach(checkEnemyCollision);

        // Check boss collision with player
        if (this.bossActive && this.boss && this.player && 
            Phaser.Geom.Intersects.RectangleToRectangle(
                this.boss.getBounds(), this.player.getBounds())) {
            this.handleGameOver();
        }
    }

    startBossBattle() {
        this.bossActive = true;
        
        // Show boss warning
        const warning = this.add.text(400, 300, 'BOSS INCOMING!', {
            fontSize: '48px',
            fill: '#ff0000',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        this.tweens.add({
            targets: warning,
            alpha: 0,
            duration: 2000,
            onComplete: () => {
                warning.destroy();
                this.createBoss();
            }
        });
    }

    nextLevel() {
        this.currentLevel++;
        this.levelText.setText('Level: ' + this.currentLevel);

        // Create level transition banner
        const levelBanner = this.add.container(400, -50);
        
        // Add background rectangle
        const bannerBg = this.add.rectangle(0, 0, 400, 80, 0x000000, 0.8);
        
        // Add text
        const levelText = this.add.text(0, 0, `Level ${this.currentLevel}`, {
            fontSize: '36px',
            fill: '#00ffff',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        
        // Add additional text based on level
        let subtitleText;
        if (this.currentLevel % 5 === 0) {
            subtitleText = this.add.text(0, 30, 'Boss Level!', {
                fontSize: '24px',
                fill: '#ff0000',
                fontStyle: 'bold'
            }).setOrigin(0.5);
        } else {
            subtitleText = this.add.text(0, 30, 'Get Ready!', {
                fontSize: '24px',
                fill: '#ffffff',
                fontStyle: 'bold'
            }).setOrigin(0.5);
        }
        
        // Add elements to banner container
        levelBanner.add([bannerBg, levelText, subtitleText]);
        levelBanner.setDepth(1000);

        // Animate banner
        this.tweens.add({
            targets: levelBanner,
            y: 300,
            duration: 1000,
            ease: 'Bounce.easeOut',
            onComplete: () => {
                // Hold for a moment
                this.time.delayedCall(1000, () => {
                    // Fade out and destroy
                    this.tweens.add({
                        targets: levelBanner,
                        alpha: 0,
                        duration: 500,
                        onComplete: () => {
                            levelBanner.destroy();
                            this.createEnemies();
                        }
                    });
                });
            }
        });
    }

    updateScore(points) {
        this.score += points;
        this.scoreText.setText('Score: ' + this.score);
        
        // Add floating score text
        const floatingScore = this.add.text(this.player.x, this.player.y - 20, `+${points}`, {
            fontSize: '24px',
            fill: '#00ff00',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        
        // Animate floating score
        this.tweens.add({
            targets: floatingScore,
            y: floatingScore.y - 50,
            alpha: 0,
            duration: 1000,
            onComplete: () => floatingScore.destroy()
        });
    }

    defeatedBoss() {
        this.bossActive = false;
        
        // Show victory message
        const victory = this.add.text(400, 300, 'BOSS DEFEATED!', {
            fontSize: '48px',
            fill: '#00ff00',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 6
        }).setOrigin(0.5);

        // Destroy boss and health bar
        if (this.boss) {
            this.boss.destroy();
            this.boss = null;
        }
        if (this.bossHealthBar) {
            this.bossHealthBar.destroy();
            this.bossHealthBar = null;
        }
        if (this.bossTimer) {
            this.bossTimer.destroy();
        }

        // Clear all projectiles
        this.projectiles.clear(true, true);

        this.tweens.add({
            targets: victory,
            alpha: 0,
            duration: 2000,
            onComplete: () => {
                victory.destroy();
                this.nextLevel();
            }
        });
    }

    handleGameOver() {
        if (this.gameOver) return;
        
        this.gameOver = true;
        
        // Clear timers
        if (this.enemyMoveTimer) {
            this.enemyMoveTimer.destroy();
        }
        if (this.spiderTimer) {
            this.spiderTimer.destroy();
        }
        if (this.bossTimer) {
            this.bossTimer.destroy();
        }

        // Clear any existing game over text
        if (this.gameOverText) {
            this.gameOverText.destroy();
        }
        if (this.finalLevelText) {
            this.finalLevelText.destroy();
        }
        if (this.finalScoreText) {
            this.finalScoreText.destroy();
        }

        // Game Over text
        this.gameOverText = this.add.text(400, 250, 'GAME OVER', {
            fontSize: '64px',
            fill: '#ff0000'
        }).setOrigin(0.5);

        this.finalLevelText = this.add.text(400, 330, `Final Level: ${this.currentLevel}`, {
            fontSize: '32px',
            fill: '#ff0000'
        }).setOrigin(0.5);
        
        this.finalScoreText = this.add.text(400, 380, `Final Score: ${this.score}`, {
            fontSize: '32px',
            fill: '#ff0000'
        }).setOrigin(0.5);
        
        // Create explosion effect
        const explosion = this.add.circle(this.player.x, this.player.y, 50, 0xff0000);
        this.tweens.add({
            targets: explosion,
            scale: 2,
            alpha: 0,
            duration: 1000,
            onComplete: () => explosion.destroy()
        });
        
        this.player.destroy();
        this.player = null;
    }

    winGame() {
        this.gameOver = true;
        
        // Clear timers
        if (this.enemyMoveTimer) {
            this.enemyMoveTimer.destroy();
        }
        if (this.spiderTimer) {
            this.spiderTimer.destroy();
        }
        if (this.bossTimer) {
            this.bossTimer.destroy();
        }

        this.add.text(400, 250, 'CONGRATULATIONS!', {
            fontSize: '64px',
            fill: '#00ff00'
        }).setOrigin(0.5);
        
        this.add.text(400, 330, 'You completed all 99 levels!', {
            fontSize: '32px',
            fill: '#00ff00'
        }).setOrigin(0.5);
        
        this.add.text(400, 380, `Final Score: ${this.score}`, {
            fontSize: '32px',
            fill: '#00ff00'
        }).setOrigin(0.5);
    }

    togglePause() {
        this.isPaused = !this.isPaused;
        if (this.isPaused) {
            this.showPauseScreen();
        } else {
            this.hidePauseScreen();
        }
    }

    showPauseScreen() {
        this.pauseScreen = this.add.container(400, 300);
        
        const bg = this.add.rectangle(0, 0, 300, 200, 0x000000, 0.8);
        
        const pauseText = this.add.text(0, -50, 'PAUSED', {
            fontSize: '32px',
            fill: '#00ffff'
        }).setOrigin(0.5);
        
        const resumeButton = this.createButton(0, 0, 'Resume', () => this.togglePause());
        const optionsButton = this.createButton(0, 50, 'Options', () => {
            // Add options functionality here
        });
        
        resumeButton.buttonText.setColor('#00ffff');
        optionsButton.buttonText.setColor('#00ffff');
        
        this.pauseScreen.add([bg, pauseText, resumeButton, optionsButton]);
    }

    hidePauseScreen() {
        if (this.pauseScreen) {
            this.pauseScreen.destroy();
        }
    }

    restartGame() {
        // Save high score
        const currentHighScore = localStorage.getItem('highScore') || 0;
        if (this.score > currentHighScore) {
            localStorage.setItem('highScore', this.score);
        }

        // Clear timers
        if (this.enemyMoveTimer) {
            this.enemyMoveTimer.destroy();
        }
        if (this.spiderTimer) {
            this.spiderTimer.destroy();
        }
        if (this.bossTimer) {
            this.bossTimer.destroy();
        }

        // Clear game over text if it exists
        if (this.gameOverText) {
            this.gameOverText.destroy();
        }
        if (this.finalLevelText) {
            this.finalLevelText.destroy();
        }
        if (this.finalScoreText) {
            this.finalScoreText.destroy();
        }

        // Reset game state
        if (this.player) this.player.destroy();
        if (this.boss) {
            this.boss.destroy();
            this.boss = null;
        }
        if (this.bossHealthBar) {
            this.bossHealthBar.destroy();
            this.bossHealthBar = null;
        }
        this.enemies.clear(true, true);
        this.projectiles.clear(true, true);
        this.spiders.clear(true, true);
        
        // Hide external buttons temporarily
        document.getElementById('pauseButton').style.display = 'none';
        document.getElementById('restartButton').style.display = 'none';

        // Reset game state and show start screen
        this.initializeGameState();
        if (this.scoreText) this.scoreText.setText('Score: 0');
        if (this.levelText) this.levelText.setText('Level: 1');
        this.showStartScreen();

        // Make sure pause screen is hidden
        this.isPaused = false;
        this.hidePauseScreen();
    }

    showStartScreen() {
        // Clear any existing text
        if (this.titleText) this.titleText.destroy();
        if (this.highScoreText) this.highScoreText.destroy();
        if (this.pressSpaceText) this.pressSpaceText.destroy();

        this.titleText = this.add.text(400, 200, 'KAMIKAZE FURRY', {
            fontSize: '64px',
            fill: '#fff',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        this.pressSpaceText = this.add.text(400, 300, 'Press SPACE to Start', {
            fontSize: '32px',
            fill: '#00ffff',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        this.highScoreText = this.add.text(400, 400, `High Score: ${localStorage.getItem('highScore') || 0}`, {
            fontSize: '24px',
            fill: '#fff'
        }).setOrigin(0.5);

        // Add blinking effect to the press space text
        this.tweens.add({
            targets: this.pressSpaceText,
            alpha: 0.5,
            duration: 800,
            yoyo: true,
            repeat: -1
        });

        // Hide external buttons
        document.getElementById('pauseButton').style.display = 'none';
        document.getElementById('restartButton').style.display = 'none';
    }

    shoot() {
        if (this.gameOver || !this.isPlaying || this.isPaused || !this.player) return;
        
        // Calculate projectile direction based on player rotation
        const angle = this.player.rotation - Math.PI / 2;
        const speed = 10;
        const offsetDistance = 30;

        // Create projectile at player's position with offset in direction of rotation
        const projectile = this.add.rectangle(
            this.player.x + Math.cos(angle) * offsetDistance,
            this.player.y + Math.sin(angle) * offsetDistance,
            4,
            12,
            0x00ffff
        );
        
        // Store velocity for movement
        projectile.velocityX = Math.cos(angle) * speed;
        projectile.velocityY = Math.sin(angle) * speed;
        
        // Set projectile properties
        projectile.setDepth(1);
        projectile.rotation = angle;
        
        this.projectiles.add(projectile);

        // Add muzzle flash effect
        const flash = this.add.circle(
            this.player.x + Math.cos(angle) * offsetDistance,
            this.player.y + Math.sin(angle) * offsetDistance,
            8,
            0x00ffff,
            0.8
        );
        this.tweens.add({
            targets: flash,
            alpha: 0,
            scale: 0.5,
            duration: 100,
            onComplete: () => flash.destroy()
        });
    }
}

// Game configuration
const config = {
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    backgroundColor: '#000000',
    parent: 'game',
    scene: MainScene,
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { y: 0 },
            debug: false
        }
    }
};

// Initialize the game
const game = new Phaser.Game(config);
