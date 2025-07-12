// Background and visual effects - DOM-based approach with ember particles
class BackgroundEffects {
    constructor() {
        this.emberContainer = document.getElementById('snow-container'); // Keep the same ID for compatibility
        this.embers = [];
        this.numEmbers = 150; // Slightly fewer particles for better performance
        
        // Create ember particles
        this.createEmbers();
        
        // Start animation
        this.animateEmbers();
        
        // Handle window resize
        window.addEventListener('resize', this.handleResize.bind(this));
    }
    
    createEmbers() {
        // Clear existing particles
        this.emberContainer.innerHTML = '';
        this.embers = [];
        
        // Create new ember particles
        for (let i = 0; i < this.numEmbers; i++) {
            const ember = document.createElement('div');
            ember.className = 'snowflake'; // Keep the same class for CSS compatibility
            
            // Random initial position (mostly from bottom)
            const x = Math.random() * window.innerWidth;
            const y = window.innerHeight - Math.random() * (window.innerHeight * 0.3); // Start near bottom
            
            // Set ember properties
            ember.style.left = `${x}px`;
            ember.style.top = `${y}px`;
            
            // Random size (smaller for embers)
            const size = (Math.random() * 3) + 1; // 1-4px
            ember.style.width = `${size}px`;
            ember.style.height = `${size}px`;
            
            // Random opacity and color variation
            const opacity = Math.random() * 0.6 + 0.2;
            ember.style.opacity = opacity.toString();
            
            // Glow effect variations
            const hue = Math.floor(Math.random() * 30); // Slight color variation in red/orange range
            const saturation = 80 + Math.floor(Math.random() * 20); // 80-100%
            const lightness = 40 + Math.floor(Math.random() * 20); // 40-60%
            
            ember.style.backgroundColor = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
            ember.style.boxShadow = `0 0 ${3 + size}px #ff3300`;
            
            // Store ember data
            this.embers.push({
                element: ember,
                x: x,
                y: y,
                size: size,
                speed: 0.3 + Math.random() * 1.2, // Rising speed (slower than snowfall)
                wind: Math.random() * 0.8 - 0.4, // Wider wind effect
                wobble: Math.random() * 2 * Math.PI, // Phase for wobbling
                flicker: 0.85 + Math.random() * 0.3, // Flicker rate multiplier
                opacity: opacity
            });
            
            // Add to container
            this.emberContainer.appendChild(ember);
        }
    }
    
    animateEmbers() {
        const height = window.innerHeight;
        const width = window.innerWidth;
        const timestamp = Date.now() / 1000;
        
        for (let i = 0; i < this.embers.length; i++) {
            const ember = this.embers[i];
            
            // Update position - embers rise up (negative y speed) with wobble
            ember.y -= ember.speed;
            ember.x += ember.wind + Math.sin(timestamp + ember.wobble) * 0.8;
            
            // Flickering effect
            const flicker = 0.7 + (Math.sin(timestamp * ember.flicker * 3) * 0.3);
            ember.element.style.opacity = (ember.opacity * flicker).toString();
            
            // Fade out as they rise
            if (ember.y < height * 0.3) {
                const fadeRatio = ember.y / (height * 0.3); // 0 to 1
                ember.element.style.opacity = (ember.opacity * flicker * fadeRatio).toString();
            }
            
            // Reset if out of bounds
            if (ember.y < -ember.size * 2) {
                ember.y = height + ember.size;
                ember.x = Math.random() * width;
                // Reset opacity
                ember.element.style.opacity = ember.opacity.toString();
            }
            
            if (ember.x > width + ember.size) {
                ember.x = -ember.size;
            } else if (ember.x < -ember.size) {
                ember.x = width + ember.size;
            }
            
            // Update element position
            ember.element.style.transform = `translate(${ember.x}px, ${ember.y}px)`;
        }
        
        // Continue animation
        requestAnimationFrame(this.animateEmbers.bind(this));
    }
    
    handleResize() {
        // Recreate ember particles when window is resized
        this.createEmbers();
    }
}

// Initialize background effects when document is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Create the background effects
    window.backgroundEffects = new BackgroundEffects();
});