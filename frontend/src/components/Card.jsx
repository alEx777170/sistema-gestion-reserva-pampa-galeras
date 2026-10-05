import React from 'react'

export default function Card({ title, image, description, children }) {
  return (
    <div className="card">
      {image && <img src={image} alt={title} className="card-image" />}
      <div className="card-content">
        {title && <h3 className="card-title">{title}</h3>}
        {description && <p className="card-description">{description}</p>}
        {children}
      </div>
    </div>
  )
}
