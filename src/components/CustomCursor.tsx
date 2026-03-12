import { useEffect, useRef, useState } from 'react'

/**
 * ActiveTheory-style custom cursor:
 * - Small white dot (leader) — instant position
 * - Larger ring (follower) — spring physics with overshoot
 * - mix-blend-mode: difference for color inversion effect
 * - Ring scales up 2x on hover over interactive elements
 */
export default function CustomCursor() {
    const ringRef = useRef<HTMLDivElement>(null)
    const dotRef = useRef<HTMLDivElement>(null)
    const [hovering, setHovering] = useState(false)

    useEffect(() => {
        let mouseX = 0
        let mouseY = 0

        // Spring physics state for ring
        let ringX = 0
        let ringY = 0
        let velocityX = 0
        let velocityY = 0

        const stiffness = 0.08   // Spring force
        const damping = 0.75     // Spring friction (lower = more bounce)
        let animationId: number

        const onMouseMove = (e: MouseEvent) => {
            mouseX = e.clientX
            mouseY = e.clientY

            // Dot follows instantly
            if (dotRef.current) {
                dotRef.current.style.left = `${mouseX}px`
                dotRef.current.style.top = `${mouseY}px`
            }
        }

        // Ring follows with spring physics (activetheory weighted cursor feel)
        const animate = () => {
            const forceX = (mouseX - ringX) * stiffness
            const forceY = (mouseY - ringY) * stiffness

            velocityX = (velocityX + forceX) * damping
            velocityY = (velocityY + forceY) * damping

            ringX += velocityX
            ringY += velocityY

            if (ringRef.current) {
                ringRef.current.style.left = `${ringX}px`
                ringRef.current.style.top = `${ringY}px`
            }

            animationId = requestAnimationFrame(animate)
        }

        // Detect hoverable elements
        const onMouseOver = (e: MouseEvent) => {
            const target = e.target as HTMLElement
            const interactive = target.closest(
                'a, button, [role="button"], input, select, textarea, .asset-card, .sidebar-link, .btn, .mode-toggle-option'
            )
            setHovering(!!interactive)
        }

        // Hide when mouse leaves viewport
        const onMouseLeave = () => {
            if (ringRef.current) ringRef.current.style.opacity = '0'
            if (dotRef.current) dotRef.current.style.opacity = '0'
        }
        const onMouseEnter = () => {
            if (ringRef.current) ringRef.current.style.opacity = '1'
            if (dotRef.current) dotRef.current.style.opacity = '1'
        }

        window.addEventListener('mousemove', onMouseMove)
        window.addEventListener('mouseover', onMouseOver)
        document.addEventListener('mouseleave', onMouseLeave)
        document.addEventListener('mouseenter', onMouseEnter)
        animationId = requestAnimationFrame(animate)

        return () => {
            window.removeEventListener('mousemove', onMouseMove)
            window.removeEventListener('mouseover', onMouseOver)
            document.removeEventListener('mouseleave', onMouseLeave)
            document.removeEventListener('mouseenter', onMouseEnter)
            cancelAnimationFrame(animationId)
        }
    }, [])

    return (
        <>
            {/* Follower Ring — activetheory style with mix-blend-mode */}
            <div
                ref={ringRef}
                className={`custom-cursor-ring ${hovering ? 'hovering' : ''}`}
            />
            {/* Leader Dot — precise mouse position */}
            <div ref={dotRef} className="custom-cursor-dot" />
        </>
    )
}
