import Scene from './components/Scene'

export default function Home() {

  return (
    <>
      <Scene />
      <div className="mensaje">
        <h1 className='text-stone-800'>Double tap for fullscreen</h1>
      </div>
    </>
  )
}