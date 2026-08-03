import { Link } from 'react-router-dom'
import { learnTopicPath } from '../routing'

export default function LearnTopicCard({ topic }) {
  const to = learnTopicPath(topic.kind, topic.slug)
  return (
    <Link to={to} className="learn-card">
      <div className="learn-card__top">
        <h3 className="learn-card__title">{topic.title}</h3>
        <div className="learn-card__badges">
          <span className="learn-badge">{topic.group}</span>
          {topic.direction ? (
            <span className="learn-badge learn-badge--dir">{topic.direction}</span>
          ) : null}
          {topic.plottedOnChart ? (
            <span className="learn-badge learn-badge--chart">on chart</span>
          ) : null}
        </div>
      </div>
      <p className="learn-card__desc">{topic.shortDescription}</p>
    </Link>
  )
}
