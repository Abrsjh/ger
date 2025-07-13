// Background and visual effects - Digital tech particles and data streams
class BackgroundEffects {
    constructor() {
        this.particleContainer = document.getElementById('snow-container'); // Keep the same ID for compatibility
        this.particles = [];
        this.numParticles = 120; // Denser digital effect
        
        // Create digital particles
        this.createParticles();
        
        // Start animation
        this.animateParticles();
        
        // Handle window resize
        window.addEventListener('resize', this.handleResize.bind(this));
    }

    createParticles() {
        // Clear existing particles
        this.particleContainer.innerHTML = '';
        this.particles = [];

        const colors = ['#00ffff', '#b000ff', '#ffffff'];

        for (let i = 0; i < this.numParticles; i++) {
            const particle = document.createElement('div');
            particle.className = 'snowflake'; // Keep the same class for CSS compatibility

            // Assign type for movement pattern
            const type = Math.random() < 0.15 ? 'stream' : 'pixel';
            particle.setAttribute('data-particle-type', type);

            // Random initial position across entire screen
            let x = Math.random() * window.innerWidth;
            let y = Math.random() * window.innerHeight;

            // Random size for digital elements (rectangular)
            const w = Math.random() * 3 + 1; // width 1-4px
            const h = Math.random() * 1 + 1; // height 1-2px

            // Base opacity
            const opacity = Math.random() * 0.5 + 0.3; // 0.3-0.8

            // Initial color
            const color = colors[Math.floor(Math.random() * colors.length)];

            // Set initial styles
            particle.style.left = `${x}px`;
            particle.style.top = `${y}px`;
            particle.style.width = `${w}px`;
            particle.style.height = `${h}px`;
            particle.style.opacity = opacity.toString();
            particle.style.backgroundColor = color;
            particle.style.boxShadow = `0 0 ${4 + w}px ${color}, 0 0 ${2 + h}px ${color}`;

            // Movement speeds
            let speedX, speedY;
            if (type === 'stream') {
                // Data stream: faster straight movement
                speedX = (Math.random() < 0.5 ? -1 : 1) * (Math.random() * 2 + 2);
                speedY = 0;
            } else {
                // Pixel drift
                speedX = (Math.random() - 0.5) * 0.5;
                speedY = (Math.random() - 0.5) * 0.5;
            }

            // Circular motion parameters (only for pixel)
            const phase = Math.random() * 2 * Math.PI;
            const radius = type === 'pixel' ? (10 + Math.random() * 20) : 0;

            // Animation speeds
            const pulseSpeed = 5 + Math.random() * 10;   // flicker speed
            const colorSpeed = 1 + Math.random() * 2;    // color cycle speed

            // Store particle data
            this.particles.push({
                element: particle,
                x, y,
                w, h,
                opacity,
                color,
                type,
                speedX,
                speedY,
                phase,
                radius,
                pulseSpeed,
                colorSpeed
            });

            // Add to container
            this.particleContainer.appendChild(particle);
        }
    }

    animateParticles() {
        const width = window.innerWidth;
        const height = window.innerHeight;
        const timestamp = Date.now() / 1000;

        for (const p of this.particles) {
            // Movement update
            if (p.type === 'pixel') {
                const circX = Math.cos(timestamp + p.phase) * p.radius * 0.1;
                const circY = Math.sin(timestamp + p.phase) * p.radius * 0.1;
                p.x += p.speedX + circX;
                p.y += p.speedY + circY;
            } else {
                p.x += p.speedX;
                p.y += p.speedY;
            }

            // Screen wrap
            if (p.x > width + p.w) p.x = -p.w;
            if (p.x < -p.w)      p.x = width + p.w;
            if (p.y > height + p.h) p.y = -p.h;
            if (p.y < -p.h)       p.y = height + p.h;

            // Digital flicker (sharp on/off)
            const flick = Math.sin(timestamp * p.pulseSpeed) > 0 ? 1 : 0;

            // Glitch effect: occasional size jitter
            if (Math.random() < 0.002) {
                const gw = p.w + (Math.random() * 2 - 1);
                const gh = p.h + (Math.random() * 2 - 1);
                p.element.style.width = `${gw}px`;
                p.element.style.height = `${gh}px`;
            } else {
                p.element.style.width = `${p.w}px`;
                p.element.style.height = `${p.h}px`;
            }

            // Apply opacity
            p.element.style.opacity = (p.opacity * flick).toString();

            // Color cycling between cyan, purple, white
            const cycle = (Math.sin(timestamp * p.colorSpeed + p.phase) + 1) / 2;
            let currentColor;
            if (cycle < 0.33) {
                currentColor = '#00ffff';
            } else if (cycle < 0.66) {
                currentColor = '#b000ff';
            } else {
                currentColor = '#ffffff';
            }
            p.element.style.backgroundColor = currentColor;
            p.element.style.boxShadow = `0 0 ${4 + p.w}px ${currentColor}, 0 0 ${2 + p.h}px ${currentColor}`;

            // Update position
            p.element.style.transform = `translate(${p.x}px, ${p.y}px)`;
        }

        // Continue animation loop
        requestAnimationFrame(this.animateParticles.bind(this));
    }

    handleResize() {
        // Recreate digital particles on resize
        this.createParticles();
    }
}

// Initialize background effects when document is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Create the background effects
    window.backgroundEffects = new BackgroundEffects();
});